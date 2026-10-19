// @vitest-environment node
// Executar exclusivamente através de npm run test:whatsapp-gate:db.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

describe.skipIf(process.env.MDB_WA_GATE_DB_TEST !== "1")(
  "opening gate on real PostgreSQL and PostgREST",
  () => {
    let gateRepo;
    let queueRepo;
    let service;
    let anon;
    let authenticated;
    let userId = 100;
    let key;
    const expiry = () => new Date(Date.now() + 14 * 86400000);

    beforeAll(async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url || "")) {
        throw new Error(
          "Integration tests require the disposable local Docker database.",
        );
      }
      const options = {
        auth: { persistSession: false, autoRefreshToken: false },
      };
      service = createClient(
        url,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        options,
      );
      anon = createClient(url, process.env.MDB_WA_GATE_ANON_KEY, options);
      authenticated = createClient(
        url,
        process.env.MDB_WA_GATE_AUTH_KEY,
        options,
      );
      gateRepo = await import("@/lib/repos/whatsappOpeningGate.repo");
      queueRepo = await import("@/lib/repos/pendingOutreach.repo");
    });
    beforeEach(() => {
      key = { orgId: 900, userId: ++userId };
    });

    it("allows exactly one opening reservation from 20 simultaneous workers", async () => {
      const expiresAt = expiry();
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          gateRepo.claimWhatsappOpeningGate({ ...key, expiresAt }),
        ),
      );
      expect(results.filter((result) => result.claimed)).toHaveLength(1);
      const current = await gateRepo.getWhatsappOpeningGate(key);
      expect(current.status).toBe("sending");
      expect(new Date(current.expires_at).getTime()).toBe(expiresAt.getTime());
      const result = await service
        .from("whatsapp_opening_gate")
        .select("*", { count: "exact" })
        .eq("org_id", String(key.orgId))
        .eq("user_id", String(key.userId));
      expect(result.error).toBeNull();
      expect(result.count).toBe(1);
    });

    it("persists the opening id and accepts only one matching reply", async () => {
      await gateRepo.claimWhatsappOpeningGate({ ...key, expiresAt: expiry() });
      await gateRepo.attachWhatsappOpeningGateOutreach({
        ...key,
        pendingOutreachId: "15",
      });
      await gateRepo.markWhatsappOpeningGateSent({
        ...key,
        templateMessageId: "opening-real-1",
        pendingOutreachId: "15",
      });
      expect(
        await gateRepo.acceptWhatsappOpeningGate({
          ...key,
          templateMessageId: "wrong-opening",
          replyMessageId: "wrong",
        }),
      ).toBeNull();
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          gateRepo.acceptWhatsappOpeningGate({
            ...key,
            templateMessageId: "opening-real-1",
            replyMessageId: "reply-" + index,
          }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      const accepted = await gateRepo.getWhatsappOpeningGate(key);
      expect(accepted).toMatchObject({
        status: "accepted",
        template_message_id: "opening-real-1",
        pending_outreach_id: "15",
      });
      expect(accepted.accepted_at).toBeTruthy();
      expect(
        await gateRepo.markWhatsappOpeningGateSent({
          ...key,
          templateMessageId: "late-send",
        }),
      ).toBeNull();
      expect((await gateRepo.getWhatsappOpeningGate(key)).status).toBe(
        "accepted",
      );
    });

    it("expires a pending gate and rejects a late acceptance before one new reservation", async () => {
      await gateRepo.claimWhatsappOpeningGate({ ...key, expiresAt: expiry() });
      await gateRepo.markWhatsappOpeningGateSent({
        ...key,
        templateMessageId: "expired-opening",
      });
      const expired = await service
        .from("whatsapp_opening_gate")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("org_id", String(key.orgId))
        .eq("user_id", String(key.userId));
      expect(expired.error).toBeNull();
      expect(
        await gateRepo.acceptWhatsappOpeningGate({
          ...key,
          templateMessageId: "expired-opening",
          replyMessageId: "late-reply",
        }),
      ).toBeNull();
      expect((await gateRepo.getWhatsappOpeningGate(key)).status).toBe(
        "expired",
      );
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          gateRepo.claimWhatsappOpeningGate({ ...key, expiresAt: expiry() }),
        ),
      );
      expect(results.filter((result) => result.claimed)).toHaveLength(1);
      expect(await gateRepo.getWhatsappOpeningGate(key)).toMatchObject({
        status: "sending",
        template_message_id: null,
      });
    });

    it("reopens an accepted gate with clean metadata for the next opening", async () => {
      await gateRepo.claimWhatsappOpeningGate({ ...key, expiresAt: expiry() });
      await gateRepo.markWhatsappOpeningGateSent({
        ...key,
        templateMessageId: "old-opening",
        pendingOutreachId: "22",
      });
      await gateRepo.acceptWhatsappOpeningGate({
        ...key,
        templateMessageId: "old-opening",
        replyMessageId: "old-reply",
      });
      const next = await gateRepo.claimWhatsappOpeningGate({
        ...key,
        expiresAt: expiry(),
      });
      expect(next.claimed).toBe(true);
      expect(next.gate).toMatchObject({
        status: "sending",
        template_message_id: null,
        pending_outreach_id: null,
        reply_message_id: null,
        accepted_at: null,
      });
    });

    it("retries a known failed opening without unlocking a pending opening", async () => {
      await gateRepo.claimWhatsappOpeningGate({ ...key, expiresAt: expiry() });
      await gateRepo.failWhatsappOpeningGate(key);
      expect((await gateRepo.getWhatsappOpeningGate(key)).status).toBe(
        "failed",
      );
      expect(
        (
          await gateRepo.claimWhatsappOpeningGate({
            ...key,
            expiresAt: expiry(),
          })
        ).claimed,
      ).toBe(true);
      await gateRepo.markWhatsappOpeningGateSent({
        ...key,
        templateMessageId: "pending-opening",
      });
      await gateRepo.failWhatsappOpeningGate(key);
      expect((await gateRepo.getWhatsappOpeningGate(key)).status).toBe(
        "pending",
      );
      expect(
        (
          await gateRepo.claimWhatsappOpeningGate({
            ...key,
            expiresAt: expiry(),
          })
        ).claimed,
      ).toBe(false);
    });

    it("denies anonymous and authenticated users while allowing the service role", async () => {
      await gateRepo.claimWhatsappOpeningGate({ ...key, expiresAt: expiry() });
      for (const client of [anon, authenticated]) {
        const read = await client.from("whatsapp_opening_gate").select("*");
        expect(read.error?.code).toBe("42501");
        const write = await client
          .from("whatsapp_opening_gate")
          .insert({
            org_id: "external",
            user_id: "external",
            expires_at: expiry().toISOString(),
          });
        expect(write.error?.code).toBe("42501");
      }
      expect(await gateRepo.getWhatsappOpeningGate(key)).toBeTruthy();
    });

    it("enforces the primary key and valid status constraint in PostgreSQL", async () => {
      await gateRepo.claimWhatsappOpeningGate({ ...key, expiresAt: expiry() });
      const duplicate = await service.from("whatsapp_opening_gate").insert({
        org_id: String(key.orgId),
        user_id: String(key.userId),
        expires_at: expiry().toISOString(),
      });
      expect(duplicate.error?.code).toBe("23505");
      const invalid = await service
        .from("whatsapp_opening_gate")
        .update({ status: "invalid" })
        .eq("org_id", String(key.orgId))
        .eq("user_id", String(key.userId));
      expect(invalid.error?.code).toBe("23514");
    });

    it("keeps pending outreach in order, excludes expired content and claims it once", async () => {
      const first = await queueRepo.createPendingOutreach({
        ...key,
        payload: { message: "first", openingGate: true },
        expiresAt: expiry(),
      });
      const second = await queueRepo.createPendingOutreach({
        ...key,
        payload: { message: "second" },
        expiresAt: expiry(),
      });
      await queueRepo.createPendingOutreach({
        ...key,
        payload: { message: "expired" },
        expiresAt: new Date(Date.now() - 1000),
      });
      await queueRepo.updatePendingOutreachTemplateMessageId(
        first.id,
        "opening-queue",
      );
      const rows = await queueRepo.getAllPendingOutreachByUser(key.userId);
      expect(rows.map((row) => row.id)).toEqual([first.id, second.id]);
      expect(rows[0].template_message_id).toBe("opening-queue");
      const claims = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          queueRepo.claimPendingOutreach(first.id, "reply-" + index),
        ),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      await queueRepo.releasePendingOutreach(first.id);
      expect(await queueRepo.claimPendingOutreach(first.id, "retry")).toBe(
        true,
      );
      await queueRepo.markPendingOutreachReplied(first.id, "retry");
      expect(
        (await queueRepo.getAllPendingOutreachByUser(key.userId)).map(
          (row) => row.id,
        ),
      ).toEqual([second.id]);
      await queueRepo.deletePendingOutreach(second.id);
      expect(await queueRepo.getAllPendingOutreachByUser(key.userId)).toEqual(
        [],
      );
    });
  },
);
