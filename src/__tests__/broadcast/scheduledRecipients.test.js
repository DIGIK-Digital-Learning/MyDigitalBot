import { describe, expect, it } from "vitest";

import {
  buildUnresolvedEntry,
  canonicalizeRecipients,
  findCandidateForRecipient,
  getRecipientKey,
  mapRecipientsToEntries,
  normalizeUser,
  uniqueRecipients,
} from "@/app/[locale]/(app)/broadcast/scheduled/helpers/recipient.helpers";

/* Utilizador da organização como o ecrã o prepara (normalizeUser). */
function candidate(raw) {
  const user = normalizeUser(raw);

  return {
    ...user,
    key: String(user.id),
    payloadRecipient: {
      userId: String(user.id),
      name: user.name,
      phoneNumber: user.phoneNumber || null,
      whatsappBsuid: null,
      whatsappUsername: null,
      birdContactId: null,
    },
  };
}

const diogo = candidate({ id: 5704, name: "Diogo", phone_number: "+351933000001" });
const beatriz = candidate({ id: 5703, name: "Beatriz", phone_number: "+351938000002" });

describe("identidade dos destinatários agendados", () => {
  it("a chave é o userId, mesmo quando há telefone", () => {
    expect(
      getRecipientKey(
        { userId: 5704, phoneNumber: "+351933000001" },
        "whatsapp",
      ),
    ).toBe("5704");
  });

  it("sem userId, a chave cai para o telefone, BSUID ou Bird", () => {
    expect(getRecipientKey({ phoneNumber: "+351933000001" }, "whatsapp")).toBe(
      "+351933000001",
    );
    expect(getRecipientKey({ whatsappBsuid: "PT.123" }, "whatsapp")).toBe(
      "PT.123",
    );
    expect(getRecipientKey({ birdContactId: "bird-1" }, "whatsapp")).toBe(
      "bird-1",
    );
  });

  it("um destinatário guardado só com userId encontra o utilizador pelo id", () => {
    const found = findCandidateForRecipient(
      { userId: 5704 },
      [beatriz, diogo],
      "whatsapp",
    );

    expect(found).toBe(diogo);
  });

  it("agenda antiga, só com telefone, encontra o utilizador pelo telefone", () => {
    const found = findCandidateForRecipient(
      { phoneNumber: "933000001" },
      [beatriz, diogo],
      "whatsapp",
    );

    expect(found).toBe(diogo);
  });

  it("Teams: o id guardado encontra o utilizador pelo id, não pelo id do Teams", () => {
    const user = candidate({
      id: 12,
      name: "Rui",
      teams_from_id: "29:abc",
      teams_aad_object_id: "aad-1",
    });
    user.key = "12";

    expect(findCandidateForRecipient(12, [user], "teams")).toBe(user);
  });

  it("devolve null quando o utilizador já não existe", () => {
    expect(
      findCandidateForRecipient({ userId: 999 }, [diogo], "whatsapp"),
    ).toBeNull();
  });

  it("agenda antiga passa à forma com userId ao guardar", () => {
    const result = canonicalizeRecipients(
      [{ phoneNumber: "+351933000001" }],
      [diogo],
      "whatsapp",
    );

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("5704");
  });

  it("a mesma pessoa guardada de duas formas conta uma vez", () => {
    const result = canonicalizeRecipients(
      [{ userId: 5704 }, { phoneNumber: "+351933000001" }],
      [diogo],
      "whatsapp",
    );

    expect(result).toHaveLength(1);
  });

  it("uniqueRecipients não duplica o mesmo userId", () => {
    expect(
      uniqueRecipients([{ userId: 1 }, { userId: "1" }, { userId: 2 }]),
    ).toHaveLength(2);
  });
});

describe("entradas da lista de destinatários", () => {
  it("o selecionado usa a chave do utilizador, por isso não aparece como disponível", () => {
    const [entry] = mapRecipientsToEntries(
      [{ userId: 5704 }],
      [diogo, beatriz],
      "whatsapp",
    );

    const available = [diogo, beatriz].filter((c) => c.key !== entry.key);

    expect(entry.name).toBe("Diogo");
    expect(entry.unresolved).toBeUndefined();
    expect(available.map((c) => c.name)).toEqual(["Beatriz"]);
  });

  it("utilizador removido não mostra o id como se fosse o nome", () => {
    const entry = buildUnresolvedEntry({ userId: 999 }, "whatsapp", "Removido");

    expect(entry.name).toBe("Removido");
    expect(entry.unresolved).toBe(true);
    expect(entry.key).toBe("999");
  });

  it("mantém o telefone como nome quando é só o que existe", () => {
    const entry = buildUnresolvedEntry(
      { phoneNumber: "+351933000001" },
      "whatsapp",
      "Removido",
    );

    expect(entry.name).toBe("+351933000001");
  });
});
