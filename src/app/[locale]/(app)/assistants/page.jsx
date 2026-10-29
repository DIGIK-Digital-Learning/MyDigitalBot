// /app/[locale]/(app)/assistants/page.js
"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./assistants.module.css";
import CreateAssistantModal from "./CreateAssistantModal";
import ChatSandbox from "./Chatbox/Chatbox.jsx";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";
import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import PresetPicker from "./PresetPicker";
import { findPreset, getAssistantPreset } from "./assistantPresets";
import {
  ASSISTANT_FILE_ACCEPT,
  resolveAssistantFileType,
} from "@/lib/uploads/assistantFiles";
import { useAlert } from "@/app/components/Alert/AlertProvider";
import CharCounter from "@/app/components/CharCounter/CharCounter";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import { limitKeepingCurrent } from "@/lib/plans/limitRules";

const STORAGE_BUCKET = "assistant-uploads";

export default function AssistantsHub() {
  const translation = useTranslations();
  const confirm = useConfirm();
  const { user, loading: authLoading, supabase } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const orgId = org?.id || null;
  const showAlert = useAlert();
  const {
    plan,
    limits,
    usage,
    reload: reloadPlanUsage,
  } = usePlanLimits(orgId);

  /*
   * Limite de assistentes do plano: contador "1 / 20" no cabeçalho da lista
   * e o botão de criar desativado quando a conta está cheia.
   */
  const assistantsFull =
    limits?.assistants != null &&
    usage?.assistants != null &&
    usage.assistants >= limits.assistants;

  const { startLoading, stopLoading } = useGlobalLoader();
  const [assistants, setAssistants] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);

  // editing state
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // vector store state
  const [vectorStore, setVectorStore] = useState(null);
  const [vsName, setVsName] = useState("");
  const [vsFiles, setVsFiles] = useState([]);
  const [isEditingVectorStore, setIsEditingVectorStore] = useState(false);
  const [vectorStoreDraftName, setVectorStoreDraftName] = useState("");
  const [vectorStoreEditFiles, setVectorStoreEditFiles] = useState([]);
  const [removedVectorFileIds, setRemovedVectorFileIds] = useState([]);
  const [isSavingVectorStore, setIsSavingVectorStore] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);

  // 1) fetch assistants when auth/org are ready
  useEffect(() => {
    if (authLoading || orgLoading || !orgId) return;

    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/assistants?orgId=${orgId}`);
        const data = await res.json().catch(() => []);
        if (!alive) return;

        const list = Array.isArray(data) ? data : [];
        setAssistants(list);
        if (!selectedId && list.length) setSelectedId(list[0].id);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) stopLoading();
      }
    })();

    return () => {
      alive = false;
    };
  }, [authLoading, orgLoading, orgId, selectedId, stopLoading]);

  // 2) fetch details of current assistant
  const fetchOne = useCallback(
    async (id) => {
      if (!id) return;
      let alive = true;
      startLoading();
      setSelected(null);
      setVectorStore(null);
      setIsEditingVectorStore(false);
      setVectorStoreDraftName("");
      setVectorStoreEditFiles([]);
      setRemovedVectorFileIds([]);

      try {
        const res = await fetch(`/api/assistants/${id}`);
        const data = await res.json();
        if (!alive) return;
        setSelected(data);

        if (data && data.vectorStoreId) {
          const r = await fetch(
            `/api/assistants/${id}/vector-store/${data.vectorStoreId}`,
          );
          const store = await r.json();
          if (!alive) return;
          setVectorStore(store);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) stopLoading();
      }
    },
    [startLoading, stopLoading],
  );

  useEffect(() => {
    if (selectedId) fetchOne(selectedId);
  }, [selectedId, fetchOne]);

  function openCreate() {
    if (!orgId) return;
    setIsModalOpen(true);
  }

  async function handleAssistantCreated() {
    if (!orgId) {
      setIsModalOpen(false);
      return;
    }
    const updated = await fetch(`/api/assistants?orgId=${orgId}`)
      .then((r) => r.json())
      .catch(() => []);
    const list = Array.isArray(updated) ? updated : [];
    setAssistants(list);
    const newest = list[list.length - 1];
    setSelectedId(newest ? newest.id : null);
    setIsModalOpen(false);
    reloadPlanUsage();
  }

  // unified field changer — writes to draft while editing
  function handleChange(field, value) {
    if (isEditing) {
      setDraft((prev) => ({ ...(prev || {}), [field]: value }));
    } else {
      setSelected((prev) => ({ ...(prev || {}), [field]: value }));
    }
  }

  /*
   * Limites do plano (#185). As instruções podem ir até ao maior entre o
   * limite e o tamanho guardado: um assistente criado antes do limite (ex.:
   * 7.405 caracteres) fica como está, mas não cresce. Sem limites carregados,
   * nada é bloqueado aqui; o servidor decide na mesma.
   */
  const instructionsPlanLimit = limits?.assistantInstructionChars ?? null;
  const instructionsLimit = limitKeepingCurrent(
    instructionsPlanLimit,
    String(selected?.instructions ?? "").length,
  );
  const draftInstructionsLength = String(draft?.instructions ?? "").length;
  const instructionsTooLong =
    instructionsLimit !== null && draftInstructionsLength > instructionsLimit;

  /*
   * Contador de ficheiros do assistente ("3 / 5"). O limite segue a regra do
   * servidor: uma coleção antiga acima do limite fica com o tamanho que tem.
   * Na edição conta os que ficam (existentes − marcados para tirar) mais os
   * novos escolhidos, para se ver o resultado antes de guardar.
   */
  const existingFileCount = vectorStore?.files?.length ?? 0;
  const filesLimit = limitKeepingCurrent(
    limits?.filesPerAssistant ?? null,
    existingFileCount,
  );
  const filesAfterEdit =
    existingFileCount - removedVectorFileIds.length + vectorStoreEditFiles.length;

  /* Avisos simples (só OK) dos limites de instruções e ficheiros. */
  async function showLimitAlert(error) {
    if (error?.code === "INSTRUCTIONS_TOO_LONG") {
      await showAlert({
        title: translation("Plans.limits.instructionsTitle"),
        message: translation("Plans.limits.instructions", { limit: error.limit }),
        tone: "warning",
      });
      return true;
    }

    if (error?.code === "ASSISTANT_FILE_LIMIT_REACHED") {
      await showAlert({
        title: translation("Plans.limits.filesTitle"),
        message: translation("Plans.limits.files", { limit: error.limit }),
        tone: "warning",
      });
      return true;
    }

    return false;
  }

  /*
   * Ficheiros (#185): a escolha é verificada logo ao escolher, antes de
   * qualquer envio, porque guardar envia primeiro os ficheiros para o
   * armazenamento e só depois pergunta ao servidor. Se passar do limite, é
   * recusada inteira e o campo fica limpo.
   */
  async function acceptFilesWithinLimit(picked, existing, kept) {
    const filesLimit = limitKeepingCurrent(
      limits?.filesPerAssistant ?? null,
      existing,
    );

    if (filesLimit === null || kept + picked.length <= filesLimit) return true;

    await showAlert({
      title: translation("Plans.limits.filesTitle"),
      message: translation("Plans.limits.filesRemaining", {
        remaining: Math.max(filesLimit - kept, 0),
        limit: filesLimit,
      }),
      tone: "warning",
    });
    return false;
  }

  // save applies the draft
  async function handleSave() {
    if (!selected || !draft) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/assistants/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          instructions: draft.instructions,
          model: draft.model,
          temperature: draft.temperature,
          top_p: draft.top_p,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (await showLimitAlert(payload)) return;
        await showError("save", payload.error || res.statusText);
        return;
      }
      setIsEditing(false);
      setDraft(null);
      await fetchOne(selected.id);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAssistant() {
    if (!selected) return;
    const ok = await confirm({
      title: translation("Delete.namedTitle", { name: selected.name }),
      message: translation("Delete.deleteMessage"),
      confirmText: translation("Common.delete"),
      cancelText: translation("Common.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    startLoading();
    try {
      const res = await fetch(`/api/assistants/${selected.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        await showError("delete", payload.error || res.statusText);
        return;
      }
      const remaining = assistants.filter((a) => a.id !== selected.id);
      setAssistants(remaining);
      setSelected(null);
      setSelectedId(remaining[0] ? remaining[0].id : null);
      reloadPlanUsage();
    } finally {
      stopLoading();
    }
  }

  /*
   * Erros da página num aviso da app, traduzido. `detail` é o motivo que o
   * servidor deu (quando deu algum).
   */
  async function showError(key, detail = "") {
    await showAlert({
      title: translation("Common.error"),
      message: translation(`Assistants.errors.${key}`, {
        detail: detail || "",
      }).trim(),
      tone: "danger",
    });
  }

  async function stageFiles(files) {
    const basePath = `${orgId}/${selected.id}/${Date.now()}`;
    const uploaded = [];

    for (const f of files) {
      const contentType = resolveAssistantFileType(f);

      if (!contentType) {
        throw new Error(translation("Assistants.errors.fileType"));
      }

      const path = `${basePath}-${f.name}`;

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, f, {
          upsert: true,
          contentType,
        });

      if (error) {
        throw new Error(
          translation("Assistants.errors.upload", { detail: error.message }),
        );
      }

      uploaded.push({
        bucket: STORAGE_BUCKET,
        path,
        name: f.name,
        size: f.size,
        type: f.type,
      });
    }

    return uploaded;
  }

  async function handleAddVectorStore() {
    if (!selected) return;
    if (!vsName.trim() || vsFiles.length === 0) return;

    startLoading();
    try {
      const uploaded = await stageFiles(vsFiles);

      const res = await fetch(`/api/assistants/${selected.id}/vector-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName: vsName, files: uploaded }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (await showLimitAlert(data)) return;
        await showError("createCollection", data.error);
        return;
      }
      setVsName("");
      setVsFiles([]);
      await fetchOne(selected.id);
    } catch (error) {
      await showError("loadFiles", error?.message);
    } finally {
      stopLoading();
    }
  }

  function beginVectorStoreEdit() {
    if (!vectorStore) return;

    setVectorStoreDraftName(vectorStore.storeName || "");
    setVectorStoreEditFiles([]);
    setRemovedVectorFileIds([]);
    setIsEditingVectorStore(true);
  }

  function toggleVectorFileRemoval(fileId) {
    const normalizedId = Number(fileId);

    setRemovedVectorFileIds((previous) =>
      previous.includes(normalizedId)
        ? previous.filter((id) => id !== normalizedId)
        : [...previous, normalizedId],
    );
  }

  function cancelVectorStoreEdit() {
    setIsEditingVectorStore(false);
    setVectorStoreDraftName("");
    setVectorStoreEditFiles([]);
    setRemovedVectorFileIds([]);
  }

  async function handleUpdateVectorStore() {
    if (!selected || !vectorStore || !selected.vectorStoreId) return;

    if (!vectorStoreDraftName.trim()) return;

    setIsSavingVectorStore(true);
    startLoading();

    try {
      const uploaded = await stageFiles(vectorStoreEditFiles);
      const res = await fetch(
        `/api/assistants/${selected.id}/vector-store/${selected.vectorStoreId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeName: vectorStoreDraftName.trim(),
            files: uploaded,
            removedFileIds: removedVectorFileIds,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (await showLimitAlert(data)) return;
        await showError("updateCollection", data.error);
        return;
      }

      cancelVectorStoreEdit();
      await fetchOne(selected.id);
    } catch (error) {
      await showError("updateCollection", error?.message);
    } finally {
      setIsSavingVectorStore(false);
      stopLoading();
    }
  }

  async function deleteVectorStore() {
    if (!selected || !selected.vectorStoreId) return;
    const ok = await confirm({
      title: translation("Delete.title"),
      message: translation("Delete.deleteMessage"),
      confirmText: translation("Common.delete"),
      cancelText: translation("Common.cancel"),
      tone: "danger",
    });

    if (!ok) return;
    startLoading();
    try {
      const res = await fetch(
        `/api/assistants/${selected.id}/vector-store/${selected.vectorStoreId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        await showError("deleteCollection", payload.message || res.statusText);
        return;
      }
      await fetchOne(selected.id);
    } finally {
      stopLoading();
    }
  }

  // helpers to read either draft (editing) or selected (read-only)
  const read = (key, fallback = "") =>
    (isEditing ? draft?.[key] : selected?.[key]) ?? fallback;

  /**
   * A predefinição a que os valores atuais correspondem.
   *
   * `null` quer dizer que o assistente foi afinado à mão — o caso de
   * todos os que existiam antes das predefinições. Aí mostramos
   * "Personalizado" com o valor, em vez de lhe chamar Normal.
   */
  const currentPreset = findPreset({
    temperature: read("temperature", null),
    top_p: read("top_p", null),
  });

  /**
   * Escolher uma predefinição escreve os dois parâmetros de uma vez.
   *
   * São dois `setDraft` seguidos, mas ambos na forma funcional, por isso
   * o segundo parte do resultado do primeiro mesmo quando o React os
   * agrupa no mesmo render.
   */
  function applyPreset(id) {
    const preset = getAssistantPreset(id);
    handleChange("temperature", preset.temperature);
    handleChange("top_p", preset.top_p);
  }

  return (
    <div className={styles.hub}>
      {/* LEFT LIST */}
      <aside className={styles.listCol}>
        <div className={styles.listHeader}>
          <span>{translation("Assistants.myAssistants")}</span>
          <UsageCounter
            used={usage?.assistants}
            limit={limits?.assistants}
            label={translation("Plans.usage.assistantsLabel")}
            hint={translation("Plans.usage.assistantsHint")}
          />
        </div>

        <div className={styles.list}>
          {assistants.map((a) => (
            <button
              key={a.id}
              className={`${styles.listItem} ${
                a.id === selectedId ? styles.listItemActive : ""
              }`}
              onClick={() => {
                setIsEditing(false);
                setDraft(null);
                setSelectedId(a.id);
              }}
            >
              <span className={styles.listItemName}>{a.name}</span>
            </button>
          ))}

          {!assistants.length && (
            <div className={styles.emptyState}>
              <p>{translation("Assistants.empty")}</p>
            </div>
          )}
        </div>

        <div className={styles.listFooter}>
          <button
            className={styles.ctaPrimary}
            onClick={openCreate}
            disabled={!orgId || assistantsFull}
            title={
              assistantsFull
                ? translation("Plans.limits.assistants", {
                    plan: plan?.name ?? "",
                    limit: limits.assistants,
                  })
                : translation("Assistants.createAssistant")
            }
          >
            {translation("Assistants.createAssistant")}
          </button>
        </div>
      </aside>

      {/* CENTER */}
      <section className={styles.mainCol}>
        {selected ? (
          <>
            {/* Keep the blue card; only invert inputs when editing */}
            <section
              className={`${styles.card} ${styles.primaryCard} ${
                isEditing ? styles.editing : ""
              }`}
            >
              <div className={styles.cardTitleRow}>
                {isEditing ? (
                  <input
                    className={styles.inputTitle}
                    value={read("name")}
                    onChange={(e) => handleChange("name", e.target.value)}
                  />
                ) : (
                  <h2 className={styles.cardTitle}>{selected.name}</h2>
                )}
              </div>

              {isEditing ? (
                <>
                  <input
                    className={styles.inputSub}
                    value={read("description")}
                    maxLength={80}
                    onChange={(e) =>
                      handleChange("description", e.target.value)
                    }
                    placeholder={translation(
                      "Assistants.details.descriptionPlaceholder",
                    )}
                  />
                  <textarea
                    className={styles.instructionsInput}
                    value={read("instructions")}
                    onChange={(e) =>
                      handleChange("instructions", e.target.value)
                    }
                    placeholder={translation(
                      "Assistants.details.instructionsPlaceholder",
                    )}
                  />
                  <CharCounter
                    length={draftInstructionsLength}
                    limit={instructionsLimit}
                    planLimit={instructionsPlanLimit}
                  />
                </>
              ) : (
                <>
                  <p className={styles.subdued}>{selected.description}</p>
                  <div className={styles.instructionsPaper}>
                    {selected.instructions}
                  </div>
                </>
              )}

              <div className={styles.specBadge}>
                {translation("Assistants.details.specs")}
              </div>

              <div className={styles.specs}>
                {/*
                  Comportamento.

                  Em leitura mostramos o nome da predefinição: "Criativo"
                  diz ao cliente o que o assistente faz, "1.10" não diz.

                  Em edição escolhe-se entre as três — as mesmas da
                  criação. Os deslizadores de Criatividade e Variedade
                  saíram: além de exigirem saber o que é `top_p`, tinham
                  os rótulos trocados (a "Variedade" mostrava a
                  `temperature` e vice-versa).
                */}
                {isEditing ? (
                  <div className={styles.specRowStacked}>
                    <span className={styles.specLabel}>
                      {translation("Assistants.details.behavior")}
                    </span>

                    <PresetPicker
                      name="assistant-behavior"
                      value={currentPreset?.id ?? null}
                      onChange={applyPreset}
                    />
                  </div>
                ) : (
                  <div className={styles.specRowBehavior}>
                    <span className={styles.specLabel}>
                      {translation("Assistants.details.behavior")}
                    </span>
                    <span className={styles.specValueBold}>
                      {currentPreset
                        ? translation(
                            `AssistantPresets.${currentPreset.id}.name`,
                          )
                        : translation("Assistants.details.customBehavior", {
                            temperature: Number(
                              selected.temperature ?? 0,
                            ).toFixed(2),
                          })}
                    </span>
                  </div>
                )}

              </div>

              {/* Meta + Actions */}
              <div className={styles.metaBar}>
                <div className={styles.metaGrid}>
                  <div>
                    <span className={styles.metaLabel}>ID</span>
                    <span>{selected.open_ai_id}</span>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>
                      {translation("Assistants.details.createdAt")}
                    </span>
                    <span>
                      {new Date(selected.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className={styles.actionsRow}>
                  {isEditing ? (
                    <>
                      <button
                        className={styles.ctaPrimary}
                        disabled={isSaving || instructionsTooLong}
                        onClick={handleSave}
                      >
                        {isSaving
                          ? translation("Assistants.details.saving")
                          : translation("Assistants.details.save")}
                      </button>
                      <button
                        className={styles.ghostBtn}
                        onClick={() => {
                          setIsEditing(false);
                          setDraft(null);
                        }}
                      >
                        {translation("Common.cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={styles.ghostBtn}
                        onClick={() => {
                          setDraft(selected ? { ...selected } : null);
                          setIsEditing(true);
                        }}
                      >
                        {translation("Assistants.details.edit")}
                      </button>
                      <button
                        className={styles.dangerBtn}
                        onClick={deleteAssistant}
                      >
                        {translation("Assistants.details.delete")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Vector store (still paper card) */}
            <section className={`${styles.card} ${styles.paperCard}`}>
              {!selected.vectorStoreId ? (
                <>
                  <h3 className={styles.cardSubtitle}>
                    {translation("Assistants.vector.create")}
                  </h3>
                  <label className={styles.label}>
                    {translation("Assistants.vector.collectionName")}
                  </label>
                  <input
                    className={styles.input}
                    value={vsName}
                    onChange={(e) => setVsName(e.target.value)}
                    placeholder={`${translation(
                      "Assistants.vector.collectionNamePlaceholder",
                    )} ${selected.name}`}
                  />
                  <div className={styles.filesLabelRow}>
                    <label className={styles.label}>
                      {translation("Assistants.vector.chooseFiles")}
                    </label>
                    {/* Coleção nova: os escolhidos sobre o limite ("2 / 5"). */}
                    <UsageCounter
                      used={vsFiles.length}
                      limit={limitKeepingCurrent(limits?.filesPerAssistant ?? null, 0)}
                      label={translation("Plans.usage.filesLabel")}
                      hint={translation("Plans.usage.filesHint")}
                    />
                  </div>
                  <input
                    className={styles.input}
                    type="file"
                    accept={ASSISTANT_FILE_ACCEPT}
                    multiple
                    onChange={async (e) => {
                      const input = e.target;
                      const picked = Array.from(input.files || []);

                      /* Coleção nova: ainda não tem ficheiros. */
                      if (!(await acceptFilesWithinLimit(picked, 0, 0))) {
                        input.value = "";
                        setVsFiles([]);
                        return;
                      }

                      setVsFiles(picked);
                    }}
                  />
                  <div className={styles.rowEnd}>
                    <button
                      className={styles.ctaPrimary}
                      onClick={handleAddVectorStore}
                      disabled={!vsName.trim() || vsFiles.length === 0}
                    >
                      {translation("Assistants.vector.createAndAttach")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.vectorHeader}>
                    <h3 className={styles.cardSubtitle}>
                      {translation("Assistants.vector.docCollection")}
                    </h3>
                    {!isEditingVectorStore && (
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={beginVectorStoreEdit}
                        disabled={!vectorStore}
                        title={translation("Assistants.vector.editTitle")}
                      >
                        {translation("Assistants.vector.edit")}
                      </button>
                    )}
                  </div>

                  {isEditingVectorStore ? (
                    <div className={styles.vectorEditor}>
                      <label
                        className={styles.label}
                        htmlFor="vector-store-name"
                      >
                        {translation("Assistants.vector.collectionName")}
                      </label>
                      <input
                        id="vector-store-name"
                        className={styles.input}
                        value={vectorStoreDraftName}
                        onChange={(e) =>
                          setVectorStoreDraftName(e.target.value)
                        }
                        placeholder={translation(
                          "Assistants.vector.storeNamePlaceholder",
                        )}
                      />

                      <p className={styles.helperText}>
                        {translation("Assistants.vector.replaceHelp")}
                      </p>

                      <div>
                        <div className={styles.filesLabelRow}>
                          <span className={styles.metaLabel}>
                            {translation("Assistants.vector.filenames")}
                          </span>
                          <UsageCounter
                            used={filesAfterEdit}
                            limit={filesLimit}
                            label={translation("Plans.usage.filesLabel")}
                            hint={translation("Plans.usage.filesHint")}
                          />
                        </div>
                        {vectorStore?.files?.length ? (
                          <ul className={styles.vectorFileList}>
                            {vectorStore.files.map((file) => {
                              const isMarkedForRemoval =
                                removedVectorFileIds.includes(Number(file.id));

                              return (
                                <li
                                  key={file.id}
                                  className={`${styles.vectorFileRow} ${
                                    isMarkedForRemoval
                                      ? styles.vectorFileRemoved
                                      : ""
                                  }`}
                                >
                                  <span>{file.name}</span>
                                  <button
                                    type="button"
                                    className={styles.fileActionBtn}
                                    onClick={() =>
                                      toggleVectorFileRemoval(file.id)
                                    }
                                  >
                                    {translation(
                                      isMarkedForRemoval
                                        ? "Assistants.vector.keep"
                                        : "Assistants.vector.remove",
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className={styles.helperText}>
                            {translation("Assistants.vector.noFiles")}
                          </p>
                        )}
                      </div>

                      <label
                        className={styles.label}
                        htmlFor="vector-store-edit-files"
                      >
                        {translation("Assistants.vector.addFiles")}
                      </label>
                      <input
                        id="vector-store-edit-files"
                        className={styles.input}
                        type="file"
                        multiple
                        onChange={async (e) => {
                          const input = e.target;
                          const picked = Array.from(input.files || []);
                          const existing = vectorStore?.files?.length ?? 0;

                          /* Ficam os existentes menos os marcados para tirar. */
                          const kept = existing - removedVectorFileIds.length;

                          if (
                            !(await acceptFilesWithinLimit(
                              picked,
                              existing,
                              kept,
                            ))
                          ) {
                            input.value = "";
                            setVectorStoreEditFiles([]);
                            return;
                          }

                          setVectorStoreEditFiles(picked);
                        }}
                      />

                      {vectorStoreEditFiles.length > 0 && (
                        <div>
                          <span className={styles.metaLabel}>
                            {translation("Assistants.vector.newFiles")}
                          </span>
                          <ul className={styles.vectorFileList}>
                            {vectorStoreEditFiles.map((file) => (
                              <li
                                key={`${file.name}-${file.size}-${file.lastModified}`}
                                className={styles.vectorFileRow}
                              >
                                <span>{file.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className={styles.rowEnd}>
                        <button
                          type="button"
                          className={styles.ctaPrimary}
                          onClick={handleUpdateVectorStore}
                          disabled={
                            isSavingVectorStore || !vectorStoreDraftName.trim()
                          }
                        >
                          {isSavingVectorStore
                            ? translation("Assistants.vector.saving")
                            : translation("Assistants.vector.save")}
                        </button>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={cancelVectorStoreEdit}
                          disabled={isSavingVectorStore}
                        >
                          {translation("Common.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.metaGrid}>
                        {vectorStore && (
                          <>
                            <div>
                              <span className={styles.metaLabel}>
                                {translation(
                                  "Assistants.vector.collectionTitle",
                                )}
                              </span>
                              <span>{vectorStore.storeName}</span>
                            </div>
                            <div>
                              <span className={styles.metaLabel}>
                                {translation("Assistants.vector.quantity")}
                              </span>
                              {/* "3 / 5" com limite no plano; sem limite, só o número. */}
                              {filesLimit !== null ? (
                                <UsageCounter
                                  used={existingFileCount}
                                  limit={filesLimit}
                                  label={translation("Plans.usage.filesLabel")}
                                  hint={translation("Plans.usage.filesHint")}
                                />
                              ) : (
                                <span>{existingFileCount}</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {vectorStore?.files?.length ? (
                        <div className={styles.vectorFilesReadOnly}>
                          <span className={styles.metaLabel}>
                            {translation("Assistants.vector.filenames")}
                          </span>
                          <ul className={styles.vectorFileList}>
                            {vectorStore.files.map((file) => (
                              <li
                                key={file.id}
                                className={styles.vectorFileRow}
                              >
                                <span>{file.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className={styles.rowEnd}>
                        <button
                          type="button"
                          className={styles.dangerBtn}
                          onClick={deleteVectorStore}
                        >
                          {translation("Common.delete")}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          </>
        ) : (
          <div className={styles.placeholderCard}>
            <p>{translation("Assistants.placeholder")}</p>
          </div>
        )}
      </section>

      {/* RIGHT: live chat */}
      <section className={styles.chatCol}>
        {selected && !authLoading && !orgLoading && (
          <ChatSandbox assistant={selected} />
        )}
      </section>

      <CreateAssistantModal
        orgId={orgId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleAssistantCreated}
        scoped
      />
    </div>
  );
}
