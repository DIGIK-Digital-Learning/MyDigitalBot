// @vitest-environment node
import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, after } from "next/server";
import * as events from "@/lib/repos/webhookEvents.repo";
import * as users from "@/lib/repos/user.repo";
import * as organizations from "@/lib/repos/organizations.repo";
import * as threads from "@/lib/repos/threads.repo";
import * as messages from "@/lib/repos/messages.repo";
import * as pending from "@/lib/repos/pendingOutreach.repo";
import * as gates from "@/lib/repos/whatsappOpeningGate.repo";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal()),
  after: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/openai/client", () => ({ openai: {} }));
vi.mock("@/lib/repos/webhookEvents.repo");
vi.mock("@/lib/repos/user.repo");
vi.mock("@/lib/repos/organizations.repo");
vi.mock("@/lib/repos/threads.repo");
vi.mock("@/lib/repos/messages.repo");
vi.mock("@/lib/repos/pendingOutreach.repo");
vi.mock("@/lib/repos/whatsappOpeningGate.repo");

process.env.MESSAGEBIRD_SIGNING_KEY = "opening-gate-test";
const { POST } = await import("@/app/api/messagebird/route");
const USER = { id: 42, organization_id: 1, phone_number: "+351910000000" };
const ORG = { id: 1, channel_id: "channel-1" };
const GATE = {
  status: "pending",
  template_message_id: "opening-1",
  pending_outreach_id: "queue-1",
  expires_at: "2099-10-28T12:00:00Z",
};
let birdFetch;

function signedRequest(body, replyTo = "opening-1") {
  const url = "http://127.0.0.1:3000/api/messagebird";
  const raw = JSON.stringify({
    service: "channels",
    event: "whatsapp.inbound",
    payload: {
      id: "reply-1",
      channelId: "channel-1",
      sender: { contact: { id: "contact-1" } },
      body,
      ...(replyTo ? { replyTo: { id: replyTo } } : {}),
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac("sha256", "opening-gate-test")
    .update(
      Buffer.concat([
        Buffer.from(timestamp + "\n" + url + "\n"),
        crypto.createHash("sha256").update(raw).digest(),
      ]),
    )
    .digest("base64");
  return new NextRequest(url, {
    method: "POST",
    body: raw,
    headers: {
      "messagebird-signature": signature,
      "messagebird-request-timestamp": timestamp,
      "x-forwarded-proto": "http",
      "x-forwarded-host": "127.0.0.1:3000",
    },
  });
}

async function processInbound(body, replyTo) {
  const response = await POST(signedRequest(body, replyTo));
  expect(response.status).toBe(200);
  expect(after).toHaveBeenCalledTimes(1);
  await after.mock.calls[0][0]();
  expect(events.markWebhookEventFailed).not.toHaveBeenCalled();
  expect(events.markWebhookEventDone).toHaveBeenCalled();
}

const BUTTON = {
  type: "text",
  text: {
    text: "Sim",
    actions: [{ type: "postback", postback: { text: "Sim" } }],
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WORKSPACE_ID", "test-workspace");
  vi.stubEnv("BIRD_API_KEY", "test-key");
  events.recordWebhookEvent.mockResolvedValue({ inserted: true, id: 1 });
  users.getUserByBirdContactId.mockResolvedValue(USER);
  users.updateUserWhatsappIdentity.mockResolvedValue(USER);
  organizations.getOrganizationByChannelId.mockResolvedValue(ORG);
  organizations.getOrganization.mockResolvedValue(ORG);
  threads.getLatestUserThreadForChannel.mockResolvedValue(null);
  gates.getWhatsappOpeningGate.mockResolvedValue(GATE);
  gates.acceptWhatsappOpeningGate.mockResolvedValue({
    ...GATE,
    status: "accepted",
  });
  pending.getAllPendingOutreachByUser.mockResolvedValue([
    {
      id: "queue-1",
      template_message_id: "opening-1",
      payload: { message: "Mensagem 1", openingGate: true },
    },
    { id: "queue-2", payload: { message: "Mensagem 2" } },
  ]);
  pending.claimPendingOutreach.mockResolvedValue(true);
  birdFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    text: async () => JSON.stringify({ id: "outbound-1" }),
  });
  vi.stubGlobal("fetch", birdFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("opening gate through the signed Bird webhook", () => {
  it("includes a broadcast queued while the opening reply is being accepted", async () => {
    const initialRows = [{ id: "queue-1", payload: { message: "Mensagem 1" } }];
    pending.getAllPendingOutreachByUser
      .mockResolvedValueOnce(initialRows)
      .mockResolvedValueOnce([
        ...initialRows,
        { id: "queue-2", payload: { message: "Mensagem 2" } },
      ]);

    await processInbound(BUTTON, "opening-1");
    expect(
      birdFetch.mock.calls.map(
        ([, request]) => JSON.parse(request.body).body.text.text,
      ),
    ).toEqual(["Mensagem 1", "Mensagem 2"]);
  });
  it.each([
    [{ type: "text", text: { text: "Sim" } }, "opening-1"],
    [BUTTON, "another-template"],
    [BUTTON, null],
  ])(
    "records an unrelated inbound without accepting or delivering the queue",
    async (body, replyTo) => {
      await processInbound(body, replyTo);
      expect(gates.acceptWhatsappOpeningGate).not.toHaveBeenCalled();
      expect(pending.claimPendingOutreach).not.toHaveBeenCalled();
      expect(birdFetch).not.toHaveBeenCalled();
      expect(messages.createMessage).toHaveBeenCalledTimes(1);
      expect(messages.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ role: "user" }),
      );
    },
  );

  it("records the matching Quick Reply once and delivers queued messages in order", async () => {
    await processInbound(BUTTON, "opening-1");
    expect(gates.acceptWhatsappOpeningGate).toHaveBeenCalledWith({
      orgId: 1,
      userId: 42,
      templateMessageId: "opening-1",
      replyMessageId: "reply-1",
    });
    const sent = birdFetch.mock.calls.map(
      ([, request]) => JSON.parse(request.body).body.text.text,
    );
    expect(sent).toEqual(["Mensagem 1", "Mensagem 2"]);
    const inbounds = messages.createMessage.mock.calls.filter(
      ([row]) => row.role === "user",
    );
    expect(inbounds).toHaveLength(1);
    expect(pending.markPendingOutreachReplied.mock.calls).toEqual([
      ["queue-1", "reply-1"],
      ["queue-2", "reply-1"],
    ]);
  });

  it("does not deliver a second time when another worker already accepted the gate", async () => {
    gates.acceptWhatsappOpeningGate.mockResolvedValue(null);
    await processInbound(BUTTON, "opening-1");
    expect(birdFetch).not.toHaveBeenCalled();
    expect(pending.claimPendingOutreach).not.toHaveBeenCalled();
  });

  it("consumes an opening-only marker without sending an empty message", async () => {
    pending.getAllPendingOutreachByUser.mockResolvedValue([
      { id: "queue-1", payload: { openingGate: true } },
    ]);
    await processInbound(BUTTON, "opening-1");
    expect(birdFetch).not.toHaveBeenCalled();
    expect(pending.markPendingOutreachReplied).toHaveBeenCalledWith(
      "queue-1",
      "reply-1",
    );
  });

  it("uses the opening queue row when a sending gate has not yet stored the template id", async () => {
    gates.getWhatsappOpeningGate.mockResolvedValue({
      ...GATE,
      status: "sending",
      template_message_id: null,
    });
    await processInbound(BUTTON, "opening-1");
    expect(gates.acceptWhatsappOpeningGate).toHaveBeenCalledWith(
      expect.objectContaining({ templateMessageId: "opening-1" }),
    );
    expect(birdFetch).toHaveBeenCalledTimes(2);
  });

  it("retains the failed first message and does not let later messages overtake it", async () => {
    birdFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: "unavailable" }),
    });
    await processInbound(BUTTON, "opening-1");
    expect(pending.releasePendingOutreach).toHaveBeenCalledWith("queue-1");
    expect(pending.markPendingOutreachReplied).not.toHaveBeenCalled();
    expect(birdFetch).toHaveBeenCalledTimes(1);
  });
});
