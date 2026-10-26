"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import styles from "./broadcast.module.css";
import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import {
  BROADCAST_MEDIA_ACCEPT,
  BROADCAST_MEDIA_BUCKET,
  broadcastMediaRejection,
  isWhatsappImageTooLarge,
  buildBroadcastMediaKey,
} from "@/lib/uploads/broadcastMedia";
import {
  effectiveFileSizeMb,
  visibleMessageLength,
} from "@/lib/plans/messageLimits";
import { createClient } from "@/utils/supabase/client";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";
import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import {
  hasReplyButtons,
  isQuizValid,
  isSurveyValid,
  makeEmptyQuiz,
  makeEmptyOpenQuestion,
  makeEmptySurvey,
  normalizeOpenQuestion,
} from "@/lib/whatsapp/question";
import {
  buttonLinkBubbles,
  chooseButtonLink,
  convertLinksForButton,
  isOnlyTrackedLinks,
} from "@/lib/whatsapp/linkButton";

import BroadcastHeader from "./components/BroadcastHeader";
import MessageComposer from "./components/MessageComposer";
import PhoneComposer from "./components/PhoneComposer";
import StartMenu from "./components/StartMenu";
import QuizComposer from "./components/QuizComposer";
import SurveyComposer from "./components/SurveyComposer";
import OpenQuestionComposer from "./components/OpenQuestionComposer";
import SchedulePanel from "./components/panels/SchedulePanel";
import TrackedLinksPanel from "./components/panels/TrackedLinksPanel";
import RecipientsPanel from "./components/recipients/RecipientsPanel";
import AudienceTabs from "./components/recipients/AudienceTabs";
import GroupsPanel from "./components/recipients/GroupsPanel";
import ChainMessagesBar from "./components/ChainMessagesBar";
import SendingBanner from "./components/SendingBanner";
import useSendProgress from "./hooks/useSendProgress";
import MediaPickerModal from "./components/MediaPickerModal";

import { COMPANY_KEYS, MAX_TRACKED_LINKS, NAME_KEYS } from "./lib/constants";
import useTextSuggestion from "./lib/useTextSuggestion";
import useImageSuggestion from "./hooks/useImageSuggestion";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import { DAILY_SENDS_TIME_ZONE } from "@/lib/plans/dailySends";
import useTrackedLinkLibrary from "./hooks/useTrackedLinkLibrary";
import useDeleteTrackedLink from "./hooks/useDeleteTrackedLink";
import {
  asList,
  buildInitialScheduledDate,
  buttonFieldsOf,
  formatHour,
  formatMinute,
  guessContentTypeFromName,
  isImageContentType,
  isSameTrackedLink,
  isVideoContentType,
  makeTrackedLinkDraft,
  makeTrackedLinkFromLibrary,
  sanitizeTrackedKey,
  makeChainStep,
  formatDelayLabel,
} from "./lib/helpers";

const EMPTY_ARRAY = [];

const MAX_CHAIN_DELAY_MINUTES = 10080; // 7 days
const MAX_CHAIN_DELAY_HOURS = 168;

function splitDelayMinutes(totalMinutes) {
  const total = Number(totalMinutes || 0);

  if (!Number.isFinite(total) || total <= 0) {
    return {
      hours: 0,
      minutes: 0,
    };
  }

  return {
    hours: Math.floor(total / 60),
    minutes: total % 60,
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.min(Math.max(Math.floor(number), min), max);
}

function getRecipientLabel(count, translation) {
  return count === 1
    ? `1 ${translation("Broadcast.recipient")}`
    : `${count} ${translation("Broadcast.smallRecipients")}`;
}

function getChannelLabel(channel) {
  return channel === "whatsapp" ? "WhatsApp" : "Teams";
}

/*
 * Hora a que os envios de hoje voltam a 0 (#188), sempre na hora de Lisboa
 * ("00:01"). Sem a hora do servidor, mostra a regra.
 */
function formatDailyResetTime(resetsAt, locale) {
  const date = resetsAt ? new Date(resetsAt) : null;
  if (!date || Number.isNaN(date.getTime())) return "00:01";

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DAILY_SENDS_TIME_ZONE,
  }).format(date);
}

export default function BroadcastPage() {
  const { user } = useAuth();
  const { org } = useOrganization(user);

  /* Limites do plano e o gasto, para o contador das agendadas (#186). */
  const {
    limits: planLimits,
    usage: planUsage,
    dailySendsResetAt,
    reload: reloadPlanUsage,
  } = usePlanLimits(org?.id);

  const locale = useLocale();
  const translation = useTranslations();
  const showAlert = useAlert();
  const confirm = useConfirm();

  const showAlertRef = useRef(showAlert);

  useEffect(() => {
    showAlertRef.current = showAlert;
  }, [showAlert]);

  const supabase = useMemo(() => createClient(), []);
  const { stopLoading } = useGlobalLoader();

  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());

  /* Destinatários: colaboradores ou grupos do Teams (#166). */
  const [audience, setAudience] = useState("users");
  const [teamsGroups, setTeamsGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [groupQuery, setGroupQuery] = useState("");

  const [allTags, setAllTags] = useState([]);
  const [assistantsList, setAssistantsList] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef(null);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [selectedAssistantIds, setSelectedAssistantIds] = useState([]);
  const activeFilterCount = selectedTagIds.length + selectedAssistantIds.length;

  const fileInputRef = useRef(null);
  const thumbInputRef = useRef(null);
  const editorRef = useRef(null);
  const [thumbForVideoUrl, setThumbForVideoUrl] = useState(null);
  /* Tipo escolhido em "Da multimédia" no menu "+"; null com a janela fechada. */
  const [mediaPickerKind, setMediaPickerKind] = useState(null);

  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [trackedLinks, setTrackedLinks] = useState([]);

  const [sending, setSending] = useState(false);

  /*
   * `sending` dura até se fechar o alerta com o resultado (o botão fica
   * desativado); `sendProgress.waiting` só até o servidor responder (a
   * faixa e o ecrã bloqueado).
   */
  const sendProgress = useSendProgress();

  const [channel, setChannel] = useState("teams");
  const [deliveryMode, setDeliveryMode] = useState("now");
  const [activeToolPanel, setActiveToolPanel] = useState(null);

  /*
   * Tipo de mensagem WhatsApp: null mostra o menu de arranque, "blank" é a
   * mensagem livre, "quiz" e "survey" são perguntas com botões de resposta
   * rápida (com e sem resposta certa) e "question" é a pergunta aberta. A
   * abertura da janela vai automaticamente a quem está fora das 24 horas.
   */
  const [composeMode, setComposeMode] = useState(null);
  const [quiz, setQuiz] = useState(() => makeEmptyQuiz());
  const [survey, setSurvey] = useState(() => makeEmptySurvey());
  const [openQuestion, setOpenQuestion] = useState(() =>
    makeEmptyOpenQuestion(),
  );

  const initialScheduledDate = useMemo(() => buildInitialScheduledDate(), []);
  const [scheduledFor, setScheduledFor] = useState(initialScheduledDate);
  const [hourDraft, setHourDraft] = useState(() =>
    formatHour(initialScheduledDate),
  );
  const [minuteDraft, setMinuteDraft] = useState(() =>
    formatMinute(initialScheduledDate),
  );
  const [timeError, setTimeError] = useState("");

  const [readChainsFeatureEnabled, setReadChainsFeatureEnabled] =
    useState(false);
  const [chainMode, setChainMode] = useState(false);
  const [activeChainStepIndex, setActiveChainStepIndex] = useState(0);
  const [chainSteps, setChainSteps] = useState(() => [
    makeChainStep(),
    makeChainStep(),
  ]);

  const browserTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const isWhatsapp = channel === "whatsapp";
  /* Quiz, sondagem e pergunta aberta nos dois canais (#151). */
  const showStartMenu = composeMode === null;
  const isSurveyMode = composeMode === "survey";
  const isQuizMode = composeMode === "quiz";
  const isOpenQuestionMode = composeMode === "question";

  /*
   * Os grupos só recebem mensagens em branco, sem cadeia: num grupo não há
   * um destinatário único para as perguntas nem para a leitura.
   */
  const isGroupAudience = audience === "groups";
  const canUseGroups =
    channel === "teams" &&
    (composeMode === null || composeMode === "blank") &&
    !chainMode;

  const activeChainStep = chainSteps[activeChainStepIndex] || chainSteps[0];

  const activeChainStepFiles = activeChainStep?.files || EMPTY_ARRAY;
  const activeChainStepTrackedLinks =
    activeChainStep?.trackedLinks || EMPTY_ARRAY;

  /* Numa cadeia, o passo ativo pode ser um quiz ou uma pergunta aberta. */
  const chainQuestionKind =
    chainMode && ["quiz", "survey", "open"].includes(activeChainStep?.kind)
      ? activeChainStep.kind
      : null;

  const composerMessage = chainMode ? activeChainStep?.message || "" : message;
  const composerFiles = chainMode ? activeChainStepFiles : files;

  /*
   * Limites do conteúdo da mensagem (#187), calculados uma vez e usados em
   * todo o composer: caracteres (como a pessoa os vê), ficheiros por
   * mensagem, MB por ficheiro e passos da corrente. Enquanto os limites não
   * chegam, nada é bloqueado (a corrente fica nos 10 de antes); o servidor
   * decide na mesma.
   */
  const messageCharLimit = planLimits?.messageChars ?? null;
  const filesPerMessageLimit = planLimits?.filesPerMessage ?? null;
  const fileSizeLimitMb = effectiveFileSizeMb(planLimits?.fileSizeMb);
  const fileSizeLimitBytes = fileSizeLimitMb * 1024 * 1024;
  const chainStepsLimit = planLimits
    ? (planLimits.chainMessages ?? Infinity)
    : 10;
  const composerMessageLength = visibleMessageLength(composerMessage);
  const composerFilesFull =
    filesPerMessageLimit !== null &&
    composerFiles.length >= filesPerMessageLimit;

  /* Os caracteres só contam na mensagem normal e nos passos da corrente. */
  const countsMessageChars =
    chainMode || (!isQuizMode && !isSurveyMode && !isOpenQuestionMode);

  function messageOverLimit(text, fileList) {
    const tooLong =
      messageCharLimit !== null &&
      visibleMessageLength(text || "") > messageCharLimit;
    const tooManyFiles =
      filesPerMessageLimit !== null &&
      (fileList || []).length > filesPerMessageLimit;
    return tooLong || tooManyFiles;
  }

  /* Numa corrente vê-se cada passo; fora dela, a mensagem do composer. */
  const composerContentOverLimit = chainMode
    ? chainSteps.some((step) => messageOverLimit(step.message, step.files))
    : messageOverLimit(countsMessageChars ? composerMessage : "", composerFiles);
  const composerTrackedLinks = chainMode
    ? activeChainStepTrackedLinks
    : trackedLinks;

  const activeQuestionKind = isQuizMode
    ? "quiz"
    : isSurveyMode
      ? "survey"
      : isOpenQuestionMode
        ? "open"
        : chainQuestionKind;

  /*
   * No WhatsApp, o link vai num botão e não entra no texto. Quiz e
   * sondagem já têm botões de resposta, e o Teams não tem este botão: aí o
   * link entra no texto, como pastilha.
   */
  const linkButtonAllowed = isWhatsapp && !hasReplyButtons(activeQuestionKind);

  const updateActiveChainStep = useCallback(
    (patchOrUpdater) => {
      setChainSteps((prev) =>
        prev.map((step, index) => {
          if (index !== activeChainStepIndex) return step;

          const patch =
            typeof patchOrUpdater === "function"
              ? patchOrUpdater(step)
              : patchOrUpdater;

          return {
            ...step,
            ...patch,
          };
        }),
      );
    },
    [activeChainStepIndex],
  );

  const setComposerMessage = useCallback(
    (nextValue) => {
      if (!chainMode) {
        setMessage(nextValue);
        return;
      }

      updateActiveChainStep((step) => ({
        message:
          typeof nextValue === "function"
            ? nextValue(step.message || "")
            : nextValue,
      }));
    },
    [chainMode, updateActiveChainStep],
  );

  const setComposerFiles = useCallback(
    (nextValue) => {
      if (!chainMode) {
        setFiles(nextValue);
        return;
      }

      updateActiveChainStep((step) => ({
        files:
          typeof nextValue === "function"
            ? nextValue(step.files || [])
            : nextValue,
      }));
    },
    [chainMode, updateActiveChainStep],
  );

  const setComposerTrackedLinks = useCallback(
    (nextValue) => {
      if (!chainMode) {
        setTrackedLinks(nextValue);
        return;
      }

      updateActiveChainStep((step) => ({
        trackedLinks:
          typeof nextValue === "function"
            ? nextValue(step.trackedLinks || [])
            : nextValue,
      }));
    },
    [chainMode, updateActiveChainStep],
  );

  /* Texto do tipo de mensagem aberto: mensagem livre ou enunciado. */
  const activeBodyText = isQuizMode
    ? quiz.body
    : isSurveyMode
      ? survey.body
      : isOpenQuestionMode
        ? openQuestion.body
        : chainQuestionKind === "open"
          ? activeChainStep.openQuestion?.body
          : chainQuestionKind
            ? activeChainStep[chainQuestionKind]?.body
            : composerMessage;

  function setActiveBodyText(text) {
    if (isQuizMode) return setQuiz((q) => ({ ...q, body: text }));
    if (isSurveyMode) return setSurvey((s) => ({ ...s, body: text }));
    if (isOpenQuestionMode) {
      return setOpenQuestion((q) => ({ ...q, body: text }));
    }

    if (chainQuestionKind) {
      const field =
        chainQuestionKind === "open" ? "openQuestion" : chainQuestionKind;

      return updateActiveChainStep((step) => ({
        [field]: { ...step[field], body: text },
      }));
    }

    return setComposerMessage(text);
  }

  /*
   * Ao trocar de canal ou de tipo de mensagem, o link muda de forma: na
   * mensagem de WhatsApp vai no botão; no Teams, no quiz e na sondagem
   * volta ao texto, como pastilha. Só converte quando se muda de um lado
   * para o outro, nunca a meio da escrita.
   */
  const lastLinkButtonAllowed = useRef(linkButtonAllowed);

  useEffect(() => {
    if (lastLinkButtonAllowed.current === linkButtonAllowed) return;
    lastLinkButtonAllowed.current = linkButtonAllowed;

    const result = convertLinksForButton({
      text: activeBodyText,
      links: composerTrackedLinks,
      buttonAllowed: linkButtonAllowed,
    });

    if (!result.changed) return;

    setComposerTrackedLinks(result.links);
    setActiveBodyText(result.text);
  });

  function addChainStep() {
    setChainSteps((prev) => {
      if (prev.length >= chainStepsLimit) return prev;

      const next = [...prev, makeChainStep()];
      setActiveChainStepIndex(next.length - 1);

      return next;
    });
  }

  function duplicateChainStep() {
    setChainSteps((prev) => {
      if (prev.length >= chainStepsLimit) return prev;

      const current = prev[activeChainStepIndex] || makeChainStep();

      const copy = makeChainStep({
        kind: current.kind || "message",
        quiz: current.quiz
          ? {
              ...current.quiz,
              options: (current.quiz.options || []).map((option) => ({
                ...option,
              })),
            }
          : undefined,
        survey: current.survey
          ? {
              ...current.survey,
              options: (current.survey.options || []).map((option) => ({
                ...option,
              })),
            }
          : undefined,
        openQuestion: current.openQuestion
          ? { ...current.openQuestion }
          : undefined,
        message: current.message || "",
        files: Array.isArray(current.files) ? [...current.files] : [],
        trackedLinks: Array.isArray(current.trackedLinks)
          ? current.trackedLinks.map((link) => ({
              ...link,
              id: makeTrackedLinkDraft().id,
            }))
          : [],
        delayAfterPreviousReadMinutes: Number(
          current.delayAfterPreviousReadMinutes || 0,
        ),
      });

      const next = [
        ...prev.slice(0, activeChainStepIndex + 1),
        copy,
        ...prev.slice(activeChainStepIndex + 1),
      ];

      setActiveChainStepIndex(activeChainStepIndex + 1);

      return next;
    });
  }

  function removeChainStep(indexToRemove) {
    setChainSteps((prev) => {
      if (prev.length <= 2) return prev;

      const next = prev.filter((_, index) => index !== indexToRemove);

      setActiveChainStepIndex((current) =>
        Math.min(
          current >= indexToRemove ? current - 1 : current,
          next.length - 1,
        ),
      );

      return next;
    });
  }

  function updateChainStepKind(indexToUpdate, kind) {
    setChainSteps((prev) =>
      prev.map((step, index) =>
        index === indexToUpdate ? { ...step, kind } : step,
      ),
    );
  }

  function updateChainStepDelay(indexToUpdate, value) {
    const raw = Number(value);
    const delay = Number.isFinite(raw)
      ? Math.min(Math.max(Math.floor(raw), 0), MAX_CHAIN_DELAY_MINUTES)
      : 0;

    setChainSteps((prev) =>
      prev.map((step, index) => {
        if (index !== indexToUpdate) return step;

        return {
          ...step,
          delayAfterPreviousReadMinutes: index === 0 ? 0 : delay,
        };
      }),
    );
  }

  function updateChainStepDelayPart(indexToUpdate, part, value) {
    if (indexToUpdate === 0) return;

    const currentStep = chainSteps[indexToUpdate] || {};
    const currentDelay = Number(currentStep.delayAfterPreviousReadMinutes || 0);

    const current = splitDelayMinutes(currentDelay);

    const nextHours =
      part === "hours"
        ? clampNumber(value, 0, MAX_CHAIN_DELAY_HOURS)
        : current.hours;

    const nextMinutes =
      part === "minutes" ? clampNumber(value, 0, 59) : current.minutes;

    updateChainStepDelay(indexToUpdate, nextHours * 60 + nextMinutes);
  }

  const imageFiles = useMemo(
    () => composerFiles.filter((f) => isImageContentType(f.contentType)),
    [composerFiles],
  );

  const videoFiles = useMemo(
    () => composerFiles.filter((f) => isVideoContentType(f.contentType)),
    [composerFiles],
  );

  const otherFiles = useMemo(
    () =>
      composerFiles.filter(
        (f) =>
          !isImageContentType(f.contentType) &&
          !isVideoContentType(f.contentType),
      ),
    [composerFiles],
  );

  const imageUrls = useMemo(() => imageFiles.map((f) => f.url), [imageFiles]);

  const normalizedTrackedLinks = useMemo(
    () =>
      composerTrackedLinks
        .map((l) => ({
          key: sanitizeTrackedKey(l.key),
          label: String(l.label || "").trim(),
          destinationUrl: String(l.destinationUrl || "").trim(),
          ...buttonFieldsOf(l),
        }))
        .filter((l) => l.key && l.label && l.destinationUrl),
    [composerTrackedLinks],
  );

  const trackedLinksCount = normalizedTrackedLinks.length;

  const getUsers = useCallback(async () => {
    if (!org?.id) return;

    try {
      const res = await fetch(`/api/users?orgId=${org.id}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch users");
      }

      setUsers(asList(data, "items"));
    } catch (err) {
      console.warn("[Broadcast] users load error:", err);

      setUsers([]);

      await showAlertRef.current({
        title: translation("Broadcast.alerts.usersLoadFailed.title"),
        message: translation("Broadcast.alerts.usersLoadFailed.message"),
        tone: "danger",
      });
    }
  }, [org?.id, translation]);

  useEffect(() => {
    if (!org?.id) return;

    let alive = true;

    (async () => {
      try {
        const [assistantsData, tagsData] = await Promise.all([
          fetch(`/api/assistants?orgId=${org.id}`).then((r) => r.json()),
          fetch(`/api/tags?orgId=${org.id}`).then((r) => r.json()),
        ]);

        if (!alive) return;

        setAssistantsList(asList(assistantsData, "items"));
        setAllTags(asList(tagsData, "items"));
      } catch (err) {
        console.warn("[Broadcast] filters load error:", err);

        if (!alive) return;

        setAssistantsList([]);
        setAllTags([]);

        await showAlertRef.current({
          title: translation("Broadcast.alerts.filtersLoadFailed.title"),
          message: translation("Broadcast.alerts.filtersLoadFailed.message"),
          tone: "danger",
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [org?.id, translation]);

  useEffect(() => {
    if (!org?.id) return;

    let alive = true;

    (async () => {
      try {
        const res = await fetch(
          `/api/organizations/messaging-feature?orgId=${org.id}&channel=whatsapp`,
        );

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load read chain feature.");
        }

        if (!alive) return;

        setReadChainsFeatureEnabled(Boolean(data?.item?.read_chains_enabled));
      } catch (err) {
        console.warn("[Broadcast] read chain feature load error:", err);

        if (!alive) return;

        setReadChainsFeatureEnabled(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [org?.id]);

  useEffect(() => {
    if (!org?.id) return;

    let alive = true;

    (async () => {
      await getUsers();

      if (alive) stopLoading();
    })();

    return () => {
      alive = false;
    };
  }, [org?.id, getUsers, stopLoading]);

  /*
   * A corrente só existe na mensagem livre, no WhatsApp e no Teams. Sair
   * dela (mudar de tipo de mensagem) desliga-a, senão o envio seguia pela
   * corrente.
   */
  useEffect(() => {
    if (chainMode && composeMode !== "blank") {
      setChainMode(false);
    }
  }, [chainMode, composeMode]);

  /* Fora da mensagem em branco do Teams, volta aos colaboradores (#166). */
  useEffect(() => {
    if (
      audience === "groups" &&
      (channel !== "teams" || composeMode !== "blank" || chainMode)
    ) {
      setAudience("users");
    }
  }, [audience, channel, composeMode, chainMode]);

  /* Só os grupos onde o bot ainda está podem receber mensagens. */
  useEffect(() => {
    if (!org?.id || channel !== "teams") return;

    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/teams-groups?orgId=${org.id}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data?.error || "Failed to load groups.");
        if (!alive) return;

        setTeamsGroups(
          (Array.isArray(data?.items) ? data.items : []).filter(
            (group) => group.isActive,
          ),
        );
      } catch (err) {
        console.warn("[Broadcast] Teams groups load error:", err);
        if (alive) setTeamsGroups([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [org?.id, channel]);

  const filteredGroups = useMemo(() => {
    const term = groupQuery.trim().toLowerCase();
    if (!term) return teamsGroups;

    return teamsGroups.filter((group) =>
      String(group.name || "")
        .toLowerCase()
        .includes(term),
    );
  }, [teamsGroups, groupQuery]);

  const allGroupsSelected =
    filteredGroups.length > 0 &&
    filteredGroups.every((group) => selectedGroups.has(group.id));

  function toggleGroup(id) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  function toggleAllGroups() {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      const ids = filteredGroups.map((group) => group.id);

      if (allGroupsSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));

      return next;
    });
  }

  /* Na mensagem em branco do Teams, "Grupos" escolhe logo esse tipo. */
  function chooseGroupAudience() {
    if (!canUseGroups) return;
    if (composeMode === null) setComposeMode("blank");
    setAudience("groups");
  }

  const normalizedUsers = useMemo(() => {
    return (users || []).map((u) => ({
      ...u,
      id: u.id,
      name: u.name,
      phone_number: u.phone_number ?? u.phoneNumber ?? "",
      whatsapp_bsuid: u.whatsapp_bsuid ?? u.whatsappBsuid ?? "",
      whatsapp_username: u.whatsapp_username ?? u.whatsappUsername ?? "",
      bird_contact_id: u.bird_contact_id ?? u.birdContactId ?? "",
      email: u.email ?? "",
      tagIds: u.tag_ids ?? (u.tags || []).map((t) => t.id),
      assistantId: u.assistant_id ?? null,
      assistantIds: u.assistant_ids ?? (u.assistant_id ? [u.assistant_id] : []),
    }));
  }, [users]);

  const selectedUsers = useMemo(
    () => normalizedUsers.filter((u) => selected.has(u.id)),
    [normalizedUsers, selected],
  );

  async function confirmSendAction({ isChain = false } = {}) {
    const recipientLabel = getRecipientLabel(selectedUsers.length, translation);
    const channelLabel = getChannelLabel(channel);

    if (isChain) {
      return confirm({
        title: translation("Broadcast.confirmSend.isChain.title"),
        message: translation("Broadcast.confirmSend.isChain.message", {
          recipientLabel,
        }),
        confirmText: translation("Broadcast.confirmSend.isChain.confirm"),
        cancelText: translation("Broadcast.confirmSend.isChain.cancel"),
      });
    }

    return confirm({
      title: translation("Broadcast.confirmSend.title"),
      message: translation("Broadcast.confirmSend.message", {
        channelLabel,
        recipientLabel,
      }),
      confirmText: translation("Broadcast.confirmSend.confirm"),
      cancelText: translation("Broadcast.confirmSend.cancel"),
    });
  }

  async function confirmScheduleAction({
    scheduledDate,
    isChain = false,
  } = {}) {
    const recipientLabel = getRecipientLabel(selectedUsers.length, translation);
    const channelLabel = getChannelLabel(channel);
    const formattedDate = scheduledDate.toLocaleString();

    if (isChain) {
      return confirm({
        title: translation("Broadcast.confirmSchedule.isChain.title"),
        message: translation("Broadcast.confirmSchedule.isChain.message", {
          recipientLabel,
          formattedDate,
        }),
        confirmText: translation("Broadcast.confirmSchedule.isChain.confirm"),
        cancelText: translation("Broadcast.confirmSchedule.isChain.cancel"),
      });
    }

    return confirm({
      title: translation("Broadcast.confirmSchedule.title"),
      message: translation("Broadcast.confirmSchedule.message", {
        channelLabel,
        recipientLabel,
        formattedDate,
      }),
      confirmText: translation("Broadcast.confirmSchedule.confirm"),
      cancelText: translation("Broadcast.confirmSchedule.cancel"),
    });
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return normalizedUsers.filter((u) => {
      const textHay = `${u.name || ""} ${u.phone_number || ""}
        ${u.whatsapp_username || ""} ${u.whatsapp_bsuid}
         ${u.email || ""}`.toLowerCase();

      const textOk = !term || textHay.includes(term);

      const tagsOk =
        selectedTagIds.length === 0 ||
        selectedTagIds.every((id) => (u.tagIds || []).includes(id));

      const assistantOk =
        selectedAssistantIds.length === 0 ||
        selectedAssistantIds.some((id) => u.assistantIds.includes(id));

      const channelOk =
        channel !== "whatsapp" ||
        !!u.phone_number ||
        !!u.whatsapp_bsuid ||
        u.bird_contact_id;

      return channelOk && textOk && tagsOk && assistantOk;
    });
  }, [normalizedUsers, q, selectedTagIds, selectedAssistantIds, channel]);

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  function toggleAllCurrent() {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = filtered.map((u) => u.id);
      const allSel = ids.length > 0 && ids.every((id) => next.has(id));

      if (allSel) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }

      return next;
    });
  }

  function removeFile(url) {
    setComposerFiles((prev) => prev.filter((f) => f.url !== url));
  }

  /*
   * Um só link por mensagem (MAX_TRACKED_LINKS): o painel desativa os
   * botões e estas funções não deixam passar do limite.
   */
  const trackedLinksFull = composerTrackedLinks.length >= MAX_TRACKED_LINKS;

  /* No WhatsApp, o link novo passa a ser o botão. */
  function addTrackedLink() {
    if (trackedLinksFull) return;

    const draft = makeTrackedLinkDraft();

    setComposerTrackedLinks((prev) => [
      ...prev,
      linkButtonAllowed ? { ...draft, button: true } : draft,
    ]);
  }

  /*
   * Um link já usado entra na mensagem: no WhatsApp, como botão; fora
   * dele, logo no balão, onde estava o cursor.
   */
  function addTrackedLinkFromLibrary(item) {
    if (
      trackedLinksFull ||
      composerTrackedLinks.some((link) => isSameTrackedLink(link, item))
    ) {
      return;
    }

    const draft = makeTrackedLinkFromLibrary(item, composerTrackedLinks);

    if (linkButtonAllowed) {
      setComposerTrackedLinks((prev) => [...prev, { ...draft, button: true }]);
      return;
    }

    setComposerTrackedLinks((prev) => [...prev, draft]);

    /* O nome vai já: a lista de links só se atualiza no render seguinte. */
    editorRef.current?.insertToken?.(
      `link.${draft.key}`,
      `Link: ${draft.label}`,
    );
  }

  function updateTrackedLink(id, field, value) {
    setComposerTrackedLinks((prev) =>
      prev.map((link) => {
        if (link.id !== id) return link;

        if (field === "key") {
          return { ...link, key: sanitizeTrackedKey(value) };
        }

        return { ...link, [field]: value };
      }),
    );
  }

  function removeTrackedLink(id) {
    setComposerTrackedLinks((prev) => prev.filter((x) => x.id !== id));
  }

  function toggleToolPanel(panel) {
    setActiveToolPanel((prev) => (prev === panel ? null : panel));
  }

  const supabaseUpload = async (pickedFiles) => {
    const bucket = BROADCAST_MEDIA_BUCKET;
    const uploaded = [];

    const contentTypeOf = (file) =>
      file.type || guessContentTypeFromName(file.name);

    /* Valida todos antes de subir o primeiro, para não ficar meio envio. */
    for (const file of pickedFiles) {
      /*
       * Tamanho: o mais baixo entre o máximo técnico e o do plano (#187).
       * Hoje são os 50 MB do plano; um plano mais baixo passaria a mandar.
       */
      const reason =
        broadcastMediaRejection(contentTypeOf(file), file.size) ||
        (Number(file.size) > fileSizeLimitBytes ? "size" : null);

      /* No WhatsApp, as imagens acima de 5 MB não chegam ao contacto. */
      if (
        !reason &&
        channel === "whatsapp" &&
        isWhatsappImageTooLarge({
          contentType: contentTypeOf(file),
          size: file.size,
        })
      ) {
        throw new Error(
          translation("Broadcast.composer.whatsappImageTooLarge", {
            name: file.name,
          }),
        );
      }

      if (reason) {
        throw new Error(
          translation(
            reason === "size"
              ? "Broadcast.composer.fileTooLarge"
              : "Broadcast.composer.fileTypeNotAllowed",
            { name: file.name, limit: fileSizeLimitMb },
          ),
        );
      }
    }

    for (const file of pickedFiles) {
      const key = buildBroadcastMediaKey(org?.id, file.name);
      const ct = contentTypeOf(file);

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(key, file, { upsert: false, contentType: ct });

      if (upErr) {
        console.error("Supabase upload error:", upErr);
        throw upErr;
      }

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);

      if (pub?.publicUrl) {
        uploaded.push({
          url: pub.publicUrl,
          name: file.name || "file",
          contentType: ct,
          size: file.size,
        });
      }
    }

    return uploaded;
  };

  /*
   * Ficheiros por mensagem (#187): quantos ainda cabem. Uma escolha que passe
   * o limite é recusada inteira, antes de enviar qualquer coisa para o
   * armazenamento, com o aviso de quantos ainda se podem juntar.
   */
  async function acceptComposerFiles(adding) {
    if (filesPerMessageLimit === null) return true;
    if (composerFiles.length + adding <= filesPerMessageLimit) return true;

    await showAlert({
      title: translation("Plans.limits.messageFilesTitle"),
      message: translation("Plans.limits.messageFilesRemaining", {
        remaining: Math.max(filesPerMessageLimit - composerFiles.length, 0),
        limit: filesPerMessageLimit,
      }),
      tone: "warning",
    });
    return false;
  }

  async function handlePickFiles(e) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;

    if (!(await acceptComposerFiles(picked.length))) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const uploaded = await supabaseUpload(picked);
      setComposerFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      await showAlert({
        title: translation("Common.error"),
        message: err.message,
        tone: "danger",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openFilePicker(accept = BROADCAST_MEDIA_ACCEPT.image) {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = accept;
    input.click?.();
  }

  function openThumbnailPicker(videoUrl) {
    setThumbForVideoUrl(videoUrl);

    setTimeout(() => {
      thumbInputRef.current?.click?.();
    }, 0);
  }

  async function handlePickThumbnail(e) {
    const picked = Array.from(e.target.files || []);

    if (!picked.length || !thumbForVideoUrl) {
      if (thumbInputRef.current) thumbInputRef.current.value = "";
      return;
    }

    try {
      const img = picked[0];
      const uploaded = await supabaseUpload([img]);
      const thumb = uploaded[0];

      if (thumb?.url) {
        setComposerFiles((prev) =>
          prev.map((f) =>
            f.url === thumbForVideoUrl ? { ...f, thumbnailUrl: thumb.url } : f,
          ),
        );
      }
    } catch (err) {
      await showAlert({
        title: translation("Common.error"),
        message: err.message,
        tone: "danger",
      });
    } finally {
      setThumbForVideoUrl(null);
      if (thumbInputRef.current) thumbInputRef.current.value = "";
    }
  }

  function removeThumbnail(videoUrl) {
    setComposerFiles((prev) =>
      prev.map((f) => (f.url === videoUrl ? { ...f, thumbnailUrl: null } : f)),
    );
  }

  const sampleRecipient = selectedUsers[0] || null;
  const sampleGroup = teamsGroups.find((group) => selectedGroups.has(group.id));
  const sampleName = isGroupAudience
    ? sampleGroup?.name || translation("Broadcast.groups.groupFallback")
    : sampleRecipient?.name || translation("Broadcast.composer.contact");

  /*
   * Rótulos das pastilhas no balão. Nome e empresa são preenchidos no envio;
   * os links rastreados vêm da lista de links desta mensagem.
   */
  const tokenLabel = useCallback(
    (key) => {
      const k = String(key || "").toLowerCase();

      if (NAME_KEYS.includes(k)) {
        return translation("Broadcast.composer.variableName");
      }

      if (COMPANY_KEYS.includes(k)) {
        return translation("Broadcast.composer.variableCompany");
      }

      if (k.startsWith("link.")) {
        const linkKey = k.slice("link.".length);
        const link = normalizedTrackedLinks.find((l) => l.key === linkKey);
        return `Link: ${link?.label || linkKey}`;
      }

      return null;
    },
    [normalizedTrackedLinks, translation],
  );

  /* Num grupo não há nome do destinatário nem links rastreados (#166). */
  const composerVariables = useMemo(
    () =>
      isGroupAudience
        ? [
            {
              key: "empresa",
              kind: "company",
              label: translation("Broadcast.composer.variableCompany"),
            },
          ]
        : [
            {
              key: "nome",
              kind: "name",
              label: translation("Broadcast.composer.variableName"),
            },
            {
              key: "empresa",
              kind: "company",
              label: translation("Broadcast.composer.variableCompany"),
            },
            ...normalizedTrackedLinks
              .filter((l) => !(linkButtonAllowed && l.button))
              .map((l) => ({
                key: `link.${l.key}`,
                kind: "link",
                label: `Link: ${l.label}`,
              })),
          ],
    [isGroupAudience, linkButtonAllowed, normalizedTrackedLinks, translation],
  );

  function insertToken(key) {
    editorRef.current?.insertToken?.(key);
  }

  /* Tipo de texto que a IA vai propor: mensagem ou enunciado de pergunta. */
  const suggestKind =
    chainQuestionKind ||
    (isQuizMode
      ? "quiz"
      : isSurveyMode
        ? "survey"
        : isOpenQuestionMode
          ? "open"
          : "message");

  /* A sugestão vive dentro do telemóvel: pedido na barra, proposta no balão. */
  const textSuggestion = useTextSuggestion({
    orgId: org?.id,
    kind: suggestKind,
    editorRef,
    resetKey: `${channel}:${composeMode}:${chainMode}:${activeChainStepIndex}`,
  });

  /*
   * A imagem com IA também vive no telemóvel. Ao usá-la, segue pelo mesmo
   * upload das imagens escolhidas no computador.
   */
  const imageSuggestion = useImageSuggestion({
    orgId: org?.id,
    resetKey: `${channel}:${composeMode}:${chainMode}:${activeChainStepIndex}`,
    onUse: async (file) => {
      /* Ficheiros por mensagem (#187): sem lugar, a imagem fica por usar. */
      if (!(await acceptComposerFiles(1))) {
        throw new Error("Plan limit reached: filesPerMessage");
      }

      const uploaded = await supabaseUpload([file]);
      setComposerFiles((prev) => [...prev, ...uploaded]);
    },
  });

  /*
   * Eliminar um link da biblioteca (#189): deixa de contar para os links do
   * plano. Não se elimina se ainda for sair numa agendada ou numa corrente.
   */
  const deleteLibraryLink = useDeleteTrackedLink(org?.id, {
    onDeleted: () => {
      trackedLinkLibrary.reload();
      reloadPlanUsage();
    },
  });

  /* Links já usados noutros envios, carregados quando o painel abre. */
  const trackedLinkLibrary = useTrackedLinkLibrary({
    orgId: org?.id,
    enabled: activeToolPanel === "links",
  });

  const activeBody = isOpenQuestionMode
    ? openQuestion.body
    : chainQuestionKind === "open"
      ? activeChainStep.openQuestion?.body
      : composerMessage;

  /*
   * Pré-visualização do link, com as regras do envio (planLinkMessages):
   * o botão por baixo da mensagem, que aparece mesmo sem texto para se ver
   * logo (o envio é que fica à espera do texto). Com imagem ou num quiz, a
   * mensagem não leva o botão e o link segue num balão à parte. No Teams
   * não há botões: avisa que o link vai no fim do texto.
   */
  const buttonCanGo = linkButtonAllowed && imageFiles.length === 0;
  const buttonChoice = buttonCanGo
    ? chooseButtonLink(activeBody, composerTrackedLinks)
    : null;
  const allBubbles = buttonLinkBubbles(composerTrackedLinks);

  const linkPreview = {
    button: buttonChoice
      ? {
          id: buttonChoice.link.button ? buttonChoice.link.id : null,
          buttonText: buttonChoice.buttonText,
        }
      : null,
    bubbles: isWhatsapp
      ? allBubbles
          .filter((bubble) => bubble.link !== buttonChoice?.link)
          .map((bubble) => ({
            id: bubble.link.id,
            buttonText: bubble.buttonText,
            text: bubble.text,
          }))
      : [],
    inTextLabels: isWhatsapp
      ? []
      : allBubbles.map((bubble) => String(bubble.link.label).trim()),
  };

  /*
   * O "+" e os anexos são os mesmos em todos os tipos de mensagem: os
   * ficheiros e os links rastreados pertencem ao composer (ou ao passo
   * ativo da corrente), não ao tipo escolhido.
   */
  const composerTools = {
    editorRef,
    tokenLabel,
    variables: composerVariables,
    onInsertToken: insertToken,
    imageFiles,
    videoFiles,
    otherFiles,
    onRemoveFile: removeFile,
    onPickThumbnail: openThumbnailPicker,
    onRemoveThumbnail: removeThumbnail,
    onAddFile: openFilePicker,
    onPickFromMedia: setMediaPickerKind,
    onAddLink: () => setActiveToolPanel("links"),
    suggest: textSuggestion,
    imageSuggest: imageSuggestion,
    linkPreview,
    onRemoveLink: removeTrackedLink,
    /*
     * Limites da mensagem (#187), para o balão (contadores) e o "+"
     * (tipos de ficheiro desativados no limite).
     */
    messageLimits: {
      length: composerMessageLength,
      charLimit: countsMessageChars ? messageCharLimit : null,
      files: composerFiles.length,
      filesLimit: filesPerMessageLimit,
      filesFull: composerFilesFull,
      filesFullHint:
        filesPerMessageLimit !== null
          ? translation("Plans.limits.messageFiles", {
              limit: filesPerMessageLimit,
            })
          : undefined,
    },
  };

  /* Num grupo não há links rastreados (#166): o "+" deixa de os oferecer. */
  if (isGroupAudience) composerTools.onAddLink = null;

  const trackedLinksValid =
    normalizedTrackedLinks.length === composerTrackedLinks.length &&
    new Set(normalizedTrackedLinks.map((l) => l.key)).size ===
      normalizedTrackedLinks.length;

  function normalizeTrackedLinksForStep(step) {
    return (step.trackedLinks || [])
      .map((link) => ({
        key: sanitizeTrackedKey(link.key),
        label: String(link.label || "").trim(),
        destinationUrl: String(link.destinationUrl || "").trim(),
        ...buttonFieldsOf(link),
      }))
      .filter((link) => link.key && link.label && link.destinationUrl);
  }

  async function validateTrackedDestinationsBeforeAction() {
    const links = chainMode
      ? chainSteps.flatMap(normalizeTrackedLinksForStep)
      : normalizedTrackedLinks;
    if (links.some((link) => !/^https?:\/\//i.test(link.destinationUrl))) {
      await showAlert({
        title: translation("Common.error"),
        message: translation("Broadcast.destinationUrlInvalid"),
        tone: "danger",
      });
      return false;
    }
    return true;
  }

  function trackedLinksValidForStep(step) {
    const normalized = normalizeTrackedLinksForStep(step);

    return (
      normalized.length === (step.trackedLinks || []).length &&
      new Set(normalized.map((link) => link.key)).size === normalized.length
    );
  }

  function chainStepHasContent(step) {
    if (step.kind === "quiz") return isQuizValid(step.quiz);
    if (step.kind === "survey") return isSurveyValid(step.survey);
    if (step.kind === "open")
      return !normalizeOpenQuestion(step.openQuestion).error;

    const message = String(step.message || "");
    const files = Array.isArray(step.files) ? step.files : [];

    return (
      (message.trim().length > 0 || files.length > 0) &&
      !needsTextBesideLinks(message, files, step.trackedLinks)
    );
  }

  /*
   * No WhatsApp o link vai num botão, e uma mensagem com botão precisa de
   * texto: só links (no texto ou no botão), sem anexos, não se envia. No
   * Teams o link aparece com o nome e fica bem sozinho; com um anexo, o
   * link segue no texto.
   */
  function needsTextBesideLinks(message, files = [], links = []) {
    if (!isWhatsapp || files.length > 0) return false;

    const text = String(message || "");

    return (
      isOnlyTrackedLinks(text) ||
      (!text.trim() && (links || []).some((link) => link.button))
    );
  }

  /*
   * Payload de um passo com pergunta: a pergunta é a própria mensagem; os
   * anexos e os links do passo seguem com ela.
   */
  function chainStepQuestionPayload(step) {
    if (step.kind === "quiz") return { kind: "quiz", ...step.quiz };
    if (step.kind === "survey") return { kind: "survey", ...step.survey };
    if (step.kind === "open") return { kind: "open", ...step.openQuestion };
    return null;
  }

  function normalizeDelayMinutes(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return 0;
    }

    return Math.min(Math.floor(number), MAX_CHAIN_DELAY_MINUTES);
  }

  function chainStepDelayValid(step, index) {
    if (index === 0) return true;

    const value = Number(step.delayAfterPreviousReadMinutes || 0);

    return (
      Number.isFinite(value) && value >= 0 && value <= MAX_CHAIN_DELAY_MINUTES
    );
  }

  const chainValid =
    !chainMode ||
    (readChainsFeatureEnabled &&
      chainSteps.length >= 2 &&
      chainSteps.length <= 10 &&
      chainSteps.every(chainStepHasContent) &&
      chainSteps.every(trackedLinksValidForStep) &&
      chainSteps.every(chainStepDelayValid));

  useEffect(() => {
    setHourDraft(formatHour(scheduledFor));
    setMinuteDraft(formatMinute(scheduledFor));
  }, [scheduledFor]);

  const commitTimeParts = useCallback(
    (hourValue, minuteValue) => {
      const rawHour = String(hourValue || "").trim();
      const rawMinute = String(minuteValue || "").trim();

      if (!rawHour || !rawMinute) {
        setTimeError("Fill in both hour and minute.");
        return false;
      }

      if (!/^\d{1,2}$/.test(rawHour) || !/^\d{1,2}$/.test(rawMinute)) {
        setTimeError("Use only numbers.");
        return false;
      }

      const hours = Number(rawHour);
      const minutes = Number(rawMinute);

      if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        setTimeError("Enter a valid time.");
        return false;
      }

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        setTimeError("Enter a valid time.");
        return false;
      }

      const totalMinutes = hours * 60 + minutes;
      const minMinutes = 8 * 60;
      const maxMinutes = 20 * 60;

      if (totalMinutes < minMinutes || totalMinutes > maxMinutes) {
        setTimeError("Choose a time between 08:00 and 20:00.");
        return false;
      }

      const next = new Date(scheduledFor);
      next.setHours(hours, minutes, 0, 0);

      setScheduledFor(next);
      setHourDraft(String(hours).padStart(2, "0"));
      setMinuteDraft(String(minutes).padStart(2, "0"));
      setTimeError("");

      return true;
    },
    [scheduledFor],
  );

  function handleHourChange(value) {
    setHourDraft(
      String(value || "")
        .replace(/\D/g, "")
        .slice(0, 2),
    );
    setTimeError("");
  }

  function handleMinuteChange(value) {
    setMinuteDraft(
      String(value || "")
        .replace(/\D/g, "")
        .slice(0, 2),
    );
    setTimeError("");
  }

  useEffect(() => {
    if (!hourDraft.trim() || !minuteDraft.trim()) return;
    if (hourDraft.length < 2 || minuteDraft.length < 2) return;

    const currentHour = formatHour(scheduledFor);
    const currentMinute = formatMinute(scheduledFor);

    if (hourDraft === currentHour && minuteDraft === currentMinute) return;

    const timeout = setTimeout(() => {
      commitTimeParts(hourDraft, minuteDraft);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [commitTimeParts, hourDraft, minuteDraft, scheduledFor]);

  const hasManualContent =
    composerMessage.trim().length > 0 || composerFiles.length > 0;

  const messageNeedsText =
    !isSurveyMode &&
    !isOpenQuestionMode &&
    !isQuizMode &&
    !chainQuestionKind &&
    needsTextBesideLinks(composerMessage, composerFiles, composerTrackedLinks);

  /* Numa corrente, o aviso diz qual é o passo que só tem links. */
  const chainStepNeedingText = chainMode
    ? chainSteps.findIndex(
        (step) =>
          (step.kind || "message") === "message" &&
          needsTextBesideLinks(
            step.message,
            step.files || [],
            step.trackedLinks,
          ),
      )
    : -1;

  /*
   * Imagem acima de 5 MB numa mensagem de WhatsApp: acontece quando se junta
   * no Teams e depois se muda de canal. Enviar fica desativado até a tirar.
   */
  const whatsappImageTooLarge =
    channel === "whatsapp"
      ? (chainMode
          ? chainSteps.flatMap((step) => step.files || [])
          : composerFiles
        ).find(isWhatsappImageTooLarge)
      : null;

  /*
   * Envios de hoje no canal (#188): 10 por dia em cada canal, para a conta
   * toda. Um envio gasta 1, seja para quantos colaboradores for; uma corrente
   * gasta 1 por mensagem. Sem os números (ainda a carregar ou sem limite no
   * plano) nada é bloqueado: o servidor decide na mesma.
   */
  const dailySendsLimit = planLimits?.dailyMessagesPerChannel ?? null;
  const dailySendsUsed = planUsage?.dailySends?.[channel] ?? null;
  const dailySendsNeeded = chainMode ? chainSteps.length : 1;
  const dailySendsRemaining =
    dailySendsLimit === null || dailySendsUsed === null
      ? null
      : Math.max(dailySendsLimit - dailySendsUsed, 0);
  const dailySendsFull =
    dailySendsRemaining !== null && dailySendsNeeded > dailySendsRemaining;
  const dailySendsResetTime = formatDailyResetTime(dailySendsResetAt, locale);

  const dailySendsWarning = !dailySendsFull
    ? null
    : chainMode && dailySendsRemaining > 0
      ? translation("Plans.limits.dailyChain", {
          steps: dailySendsNeeded,
          remaining: dailySendsRemaining,
          channel: getChannelLabel(channel),
          time: dailySendsResetTime,
        })
      : translation("Plans.limits.daily", {
          limit: dailySendsLimit,
          channel: getChannelLabel(channel),
          time: dailySendsResetTime,
        });

  const composerWarning = whatsappImageTooLarge
    ? translation("Broadcast.composer.whatsappImageTooLarge", {
        name: whatsappImageTooLarge.name,
      })
    : dailySendsWarning
      ? dailySendsWarning
      : chainStepNeedingText >= 0
      ? translation("Broadcast.composer.chainStepNeedsText", {
          step: chainStepNeedingText + 1,
        })
      : messageNeedsText
        ? translation("Broadcast.composer.linkNeedsText")
        : null;

  const quizValid = isQuizValid(quiz);
  const surveyValid = isSurveyValid(survey);
  const openQuestionValid = !normalizeOpenQuestion(openQuestion).error;

  const baseCanSend =
    (isGroupAudience ? selectedGroups.size : selected.size) > 0 &&
    (isSurveyMode
      ? surveyValid && trackedLinksValid
      : isOpenQuestionMode
        ? openQuestionValid && trackedLinksValid
        : isQuizMode
          ? quizValid && trackedLinksValid
          : chainMode
            ? chainValid
            : trackedLinksValid && hasManualContent && !messageNeedsText);

  const scheduleInvalid =
    deliveryMode === "schedule" &&
    (!scheduledFor || scheduledFor.getTime() <= Date.now() || !!timeError);

  /*
   * Limite de agendadas do plano (#186): com a conta cheia, Agendar fica
   * desativado (enviar já continua possível). As correntes não contam.
   */
  const scheduledFull =
    deliveryMode === "schedule" &&
    !chainMode &&
    planLimits?.scheduledMessages != null &&
    planUsage?.scheduledMessages != null &&
    planUsage.scheduledMessages >= planLimits.scheduledMessages;

  /* Mensagem acima dos limites (#187): enviar e agendar ficam desativados. */
  const canSend =
    baseCanSend &&
    !scheduleInvalid &&
    !scheduledFull &&
    !composerContentOverLimit &&
    !whatsappImageTooLarge &&
    !dailySendsFull &&
    !showStartMenu;

  function buildRecipients(chosen) {
    return chosen
      .filter((u) => u.phone_number || u.whatsapp_bsuid || u.bird_contact_id)
      .map((u) => ({
        userId: u.id,
        name: u.name || null,
        phoneNumber: u.phone_number || null,
        whatsappBsuid: u.whatsapp_bsuid || null,
        whatsappUsername: u.whatsapp_username || null,
        birdContactId: u.bird_contact_id || null,
      }));
  }

  /*
   * Pergunta do envio, conforme o tipo escolhido. Os anexos e os links
   * seguem no payload como na mensagem em branco.
   */
  function composerQuestionPayload() {
    if (isSurveyMode) return { kind: "survey", ...survey };
    if (isOpenQuestionMode) return { kind: "open", ...openQuestion };

    if (isQuizMode) {
      return {
        kind: "quiz",
        body: quiz.body,
        options: quiz.options,
        feedbackCorrect: quiz.feedbackCorrect,
        feedbackIncorrect: quiz.feedbackIncorrect,
      };
    }

    return null;
  }

  function buildBroadcastPayload(chosen) {
    if (channel === "whatsapp") {
      const question = composerQuestionPayload();

      return {
        orgId: org?.id,
        message: question ? "" : composerMessage,
        imageUrls,
        files: composerFiles,
        trackedLinks: normalizedTrackedLinks,
        recipients: buildRecipients(chosen),
        ...(question ? { question } : {}),
      };
    }

    const question = composerQuestionPayload();

    return {
      orgId: org?.id,
      userIds: chosen.map((u) => u.id),
      message: question ? "" : composerMessage,
      files: composerFiles,
      trackedLinks: normalizedTrackedLinks,
      ...(question ? { question } : {}),
    };
  }

  function buildChainPayload(chosen) {
    return {
      orgId: org?.id,
      createdByUserId: user?.id || null,
      channel,
      recipients: isWhatsapp
        ? buildRecipients(chosen)
        : chosen.map((u) => ({ userId: u.id })),
      steps: chainSteps.map((step, index) => {
        const question = chainStepQuestionPayload(step);

        return {
          message: question ? "" : step.message || "",
          files: Array.isArray(step.files) ? step.files : [],
          trackedLinks: normalizeTrackedLinksForStep(step),
          question,
          delayAfterPreviousReadMinutes:
            index === 0
              ? 0
              : normalizeDelayMinutes(step.delayAfterPreviousReadMinutes),
        };
      }),
    };
  }

  function getBroadcastCounts(data, fallbackTotal = 0) {
    if (!data || typeof data !== "object") {
      return {
        ok: fallbackTotal,
        failed: 0,
        total: fallbackTotal,
      };
    }

    const results = Array.isArray(data.results) ? data.results : [];

    const ok = Number.isFinite(Number(data.ok))
      ? Number(data.ok)
      : Number.isFinite(Number(data.successes))
        ? Number(data.successes)
        : results.length
          ? results.filter((r) => r.ok).length
          : fallbackTotal;

    const failed = Number.isFinite(Number(data.failed))
      ? Number(data.failed)
      : Number.isFinite(Number(data.failures))
        ? Number(data.failures)
        : results.length
          ? results.length - ok
          : 0;

    return {
      ok,
      failed,
      total: ok + failed,
    };
  }

  function normalizePhoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function phonesMatch(a, b) {
    const da = normalizePhoneDigits(a);
    const db = normalizePhoneDigits(b);

    if (!da || !db) return false;

    return da === db || da.endsWith(db) || db.endsWith(da);
  }

  function getResultReason(result) {
    if (!result) return "Unknown error.";

    if (result.error) return String(result.error);
    if (result.reason) return String(result.reason);

    if (typeof result.data === "string" && result.data.trim()) {
      return result.data.trim();
    }

    if (result.data?.error) return String(result.data.error);
    if (result.data?.message) return String(result.data.message);
    if (result.data?.detail) return String(result.data.detail);

    if (result.status) {
      return `Request failed with status ${result.status}.`;
    }

    return "Unknown error.";
  }

  function getFailedRecipients(data, selectedUsers, channel) {
    if (!data || typeof data !== "object") return [];

    const results = Array.isArray(data.results) ? data.results : [];

    return results
      .filter((r) => !r.ok)
      .map((r) => {
        let matchedUser = null;

        if (channel === "teams") {
          matchedUser = selectedUsers.find(
            (u) => String(u.id) === String(r.userId),
          );
        } else {
          matchedUser =
            selectedUsers.find((u) => String(u.id) === String(r.userId)) ||
            selectedUsers.find((u) =>
              phonesMatch(u.phone_number || u.phoneNumber, r.recipient || r.to),
            ) ||
            selectedUsers.find(
              (u) =>
                r.whatsappBsuid &&
                String(u.whatsapp_bsuid || u.whatsappBsuid) ===
                  String(r.whatsappBsuid),
            ) ||
            selectedUsers.find(
              (u) =>
                r.birdContactId &&
                String(u.bird_contact_id || u.birdContactId) ===
                  String(r.birdContactId),
            );
        }

        const fallbackIdentifier =
          r.recipient ||
          r.to ||
          r.whatsappUsername ||
          r.whatsappBsuid ||
          r.birdContactId ||
          r.userId ||
          r.email ||
          "Unknown recipient";

        const label =
          matchedUser?.name ||
          matchedUser?.email ||
          matchedUser?.phone_number ||
          matchedUser?.whatsapp_username ||
          matchedUser?.whatsapp_bsuid ||
          fallbackIdentifier;

        const contact =
          channel === "teams"
            ? matchedUser?.email || r.userId || ""
            : matchedUser?.phone_number ||
              matchedUser?.whatsapp_username ||
              matchedUser?.whatsapp_bsuid ||
              r.to ||
              r.recipient ||
              r.whatsappBsuid ||
              r.birdContactId ||
              "";

        return {
          label,
          contact,
          reason: getResultReason(r),
        };
      });
  }

  function formatFailedRecipients(failedRecipients, maxToShow = 8) {
    if (!failedRecipients.length) return "";

    const visible = failedRecipients.slice(0, maxToShow);

    const lines = visible.map((r) => {
      const contact =
        r.contact && String(r.contact) !== String(r.label)
          ? ` (${r.contact})`
          : "";

      return `- ${r.label}${contact}: ${r.reason}`;
    });

    const hiddenCount = failedRecipients.length - visible.length;

    if (hiddenCount > 0) {
      lines.push(`- And ${hiddenCount} more...`);
    }

    return `Failed recipients:\n${lines.join("\n")}`;
  }

  function formatBroadcastResultMessage({
    channel,
    action,
    ok,
    failed,
    note,
    failedRecipients = [],
  }) {
    const channelLabel = channel === "whatsapp" ? "WhatsApp" : "Teams";

    const successLabel = ok === 1 ? "1 success" : `${ok} successes`;
    const failedLabel = failed === 1 ? "1 fail" : `${failed} fails`;

    const mainMessage = `${channelLabel} broadcast ${action} with ${successLabel} and ${failedLabel}.`;
    const failureDetails = formatFailedRecipients(failedRecipients);

    return [mainMessage, note, failureDetails].filter(Boolean).join("\n\n");
  }

  async function validateContentBeforeAction(action) {
    if (isSurveyMode) {
      if (surveyValid) return true;

      await showAlert({
        title: translation("Broadcast.alerts.surveyInvalid.title"),
        message: translation("Broadcast.alerts.surveyInvalid.message"),
        tone: "warning",
      });

      return false;
    }

    if (isOpenQuestionMode) {
      if (openQuestionValid) return true;
      await showAlert({
        title: translation("Broadcast.alerts.openQuestionInvalid.title"),
        message: translation("Broadcast.alerts.openQuestionInvalid.message"),
        tone: "warning",
      });
      return false;
    }

    if (isQuizMode) {
      if (quizValid) return true;

      await showAlert({
        title: translation("Broadcast.alerts.quizInvalid.title"),
        message: translation("Broadcast.alerts.quizInvalid.message"),
        tone: "warning",
      });

      return false;
    }

    if (!hasManualContent && !chainMode) {
      await showAlert({
        title: translation("Broadcast.alerts.contentMissing.title"),
        message:
          action === "schedule"
            ? translation("Broadcast.alerts.contentMissing.scheduleMessage")
            : translation("Broadcast.alerts.contentMissing.sendMessage"),
        tone: "warning",
      });

      return false;
    }

    return true;
  }

  /* =========================================================
     GRUPOS DO TEAMS (#166)
     ========================================================= */

  const nameTokenPattern = new RegExp(
    `\\{\\{\\s*(${NAME_KEYS.join("|")})\\s*\\}\\}`,
    "i",
  );

  async function validateGroupBroadcast(action) {
    if (!selectedGroups.size) {
      await showAlert({
        title: translation("Broadcast.groups.tabGroups"),
        message: translation("Broadcast.groups.chooseGroups"),
        tone: "warning",
      });
      return false;
    }

    if (!(await validateContentBeforeAction(action))) return false;

    if (composerTrackedLinks.length) {
      await showAlert({
        title: translation("Broadcast.groups.noTrackedLinks.title"),
        message: translation("Broadcast.groups.noTrackedLinks.message"),
        tone: "warning",
      });
      return false;
    }

    if (nameTokenPattern.test(composerMessage)) {
      await showAlert({
        title: translation("Broadcast.groups.noNameVariable.title"),
        message: translation("Broadcast.groups.noNameVariable.message"),
        tone: "warning",
      });
      return false;
    }

    return true;
  }

  function buildGroupPayload() {
    return {
      orgId: org?.id,
      groupIds: [...selectedGroups],
      message: composerMessage,
      files: composerFiles,
      imageUrls,
    };
  }

  function groupResultSummary(data) {
    const results = Array.isArray(data?.results) ? data.results : [];
    const ok = results.filter((r) => r.ok).length;

    const failedLines = results
      .filter((r) => !r.ok)
      .map((r) => {
        const group = teamsGroups.find((g) => g.id === r.groupId);
        const name = group?.name || translation("Broadcast.groups.unnamed");

        return `- ${name}: ${r.error || translation("Common.error")}`;
      });

    return {
      failed: results.length - ok,
      message: [
        translation("Broadcast.groups.sent.message", {
          ok,
          total: results.length,
        }),
        failedLines.join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  /*
   * Limite de mensagens agendadas do plano (#186): aviso simples, só com OK.
   * Devolve true se era esse o erro, para quem chama não mostrar outro aviso.
   */
  async function showScheduledLimitAlert(data) {
    if (data?.code !== "SCHEDULED_LIMIT_REACHED") return false;

    await showAlert({
      title: translation("Plans.limits.scheduledTitle"),
      message: translation("Plans.limits.scheduled", { limit: data.limit }),
      tone: "warning",
    });
    return true;
  }

  /*
   * Conteúdo acima dos limites do plano (#187), recusado pelo servidor:
   * aviso simples, só com OK. Numa corrente diz qual é o passo. Devolve true
   * se era esse o erro, para quem chama não mostrar outro aviso.
   */
  async function showContentLimitAlert(data) {
    /*
     * Limite diário de envios (#188): o servidor diz quantos sobram e quando
     * o contador volta a 0. Os números do ecrã acompanham.
     */
    /* Links rastreados do plano (#189): é preciso eliminar para criar. */
    if (data?.code === "TRACKED_LINKS_LIMIT_REACHED") {
      reloadPlanUsage();
      await showAlert({
        title: translation("Plans.limits.trackedLinksTitle"),
        message: translation("Plans.limits.trackedLinksFull", {
          limit: data.limit,
        }),
        tone: "warning",
      });
      return true;
    }

    if (data?.code === "DAILY_LIMIT_REACHED") {
      reloadPlanUsage();
      const time = formatDailyResetTime(data.resetsAt, locale);
      const channelName = getChannelLabel(data.channel || channel);

      await showAlert({
        title: translation("Plans.limits.dailyTitle"),
        message:
          chainMode && data.remaining > 0
            ? translation("Plans.limits.dailyChain", {
                steps: chainSteps.length,
                remaining: data.remaining,
                channel: channelName,
                time,
              })
            : translation("Plans.limits.daily", {
                limit: data.limit,
                channel: channelName,
                time,
              }),
        tone: "warning",
      });
      return true;
    }

    const keys = {
      MESSAGE_TOO_LONG: "messageTooLong",
      TOO_MANY_FILES: "messageFiles",
      CHAIN_TOO_LONG: "chainTooLong",
    };
    const key = keys[data?.code];
    if (!key) return false;

    const message = translation(`Plans.limits.${key}`, { limit: data.limit });

    await showAlert({
      title: translation(`Plans.limits.${key}Title`),
      message: data.step
        ? `${translation("Plans.limits.inStep", { step: data.step })} ${message}`
        : message,
      tone: "warning",
    });
    return true;
  }

  async function sendToGroups() {
    if (!(await validateGroupBroadcast("send"))) return;

    const confirmed = await confirm({
      title: translation("Broadcast.groups.confirmSend.title"),
      message: translation("Broadcast.groups.confirmSend.message", {
        count: selectedGroups.size,
      }),
      confirmText: translation("Broadcast.confirmSend.confirm"),
      cancelText: translation("Broadcast.confirmSend.cancel"),
    });

    if (!confirmed) return;

    setSending(true);

    try {
      const res = await fetch("/api/broadcast/teams-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGroupPayload()),
      });

      const data = await res.json().catch(() => ({}));

      if (await showContentLimitAlert(data)) return;
      if (!res.ok) throw new Error(data?.error || translation("Common.error"));

      const summary = groupResultSummary(data);

      await showAlert({
        title: translation(
          summary.failed
            ? "Broadcast.groups.sent.titleWithIssues"
            : "Broadcast.groups.sent.title",
        ),
        message: summary.message,
        tone: summary.failed ? "warning" : "success",
      });
    } catch (err) {
      await showAlert({
        title: translation("Common.error"),
        message: err.message,
        tone: "danger",
      });
    } finally {
      setSending(false);
      reloadPlanUsage();
    }
  }

  async function scheduleToGroups(scheduledDate) {
    if (!(await validateGroupBroadcast("schedule"))) return;

    const date = scheduledDate.toLocaleString();

    const confirmed = await confirm({
      title: translation("Broadcast.groups.confirmSchedule.title"),
      message: translation("Broadcast.groups.confirmSchedule.message", {
        count: selectedGroups.size,
        date,
      }),
      confirmText: translation("Broadcast.confirmSchedule.confirm"),
      cancelText: translation("Broadcast.confirmSchedule.cancel"),
    });

    if (!confirmed) return;

    setSending(true);

    try {
      const res = await fetch("/api/broadcast/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: org?.id,
          channel: "teams",
          scheduledFor: scheduledDate.toISOString(),
          timezone: browserTimeZone,
          payload: buildGroupPayload(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (await showScheduledLimitAlert(data)) return;
      if (await showContentLimitAlert(data)) return;
      if (!res.ok) throw new Error(data?.error || translation("Common.error"));

      await showAlert({
        title: translation("Broadcast.groups.scheduled.title"),
        message: translation("Broadcast.groups.scheduled.message", {
          count: selectedGroups.size,
          date,
        }),
        tone: "success",
      });

      reloadPlanUsage();
      setDeliveryMode("now");
    } catch (err) {
      await showAlert({
        title: translation("Common.error"),
        message: err.message,
        tone: "danger",
      });
    } finally {
      setSending(false);
      reloadPlanUsage();
    }
  }

  async function handleSend() {
    if (isGroupAudience) {
      await sendToGroups();
      return;
    }

    if (!(await validateTrackedDestinationsBeforeAction())) return;
    if (!selectedUsers.length) {
      await showAlert({
        title: "Choose recipients",
        message: translation("Broadcast.chooseRecipients"),
        tone: "warning",
      });
      return;
    }

    if (chainMode) {
      if (!readChainsFeatureEnabled) {
        await showAlert({
          title: "Read chains are disabled",
          message: "Enable read chain messages in Automations first.",
          tone: "warning",
        });
        return;
      }

      if (!chainValid) {
        await showAlert({
          title: "Complete the chain",
          message:
            "A read chain needs 2 to 10 freeform messages, and every message must have text or attachments. Tracked links must also be complete.",
          tone: "warning",
        });
        return;
      }

      const confirmed = await confirmSendAction({ isChain: true });

      if (!confirmed) return;

      setSending(true);

      try {
        const res = await sendProgress.sendRequest("/api/broadcast/read-chain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildChainPayload(selectedUsers)),
        });

        const data = await res.json().catch(() => ({}));

        if (await showContentLimitAlert(data)) return;
        if (!res.ok) {
          throw new Error(data?.error || "Failed to send read chain.");
        }

        const counts = getBroadcastCounts(data, selectedUsers.length);
        const failedRecipients = getFailedRecipients(
          data,
          selectedUsers,
          channel,
        );

        await showAlert({
          title:
            counts.failed > 0
              ? "Read chain started with issues"
              : "Read chain started",
          message: formatBroadcastResultMessage({
            channel,
            action: "started",
            ok: counts.ok,
            failed: counts.failed,
            note:
              data?.note ||
              (isWhatsapp
                ? "Message 1 was sent if the 24h window was open. If not, the opening message was sent and the chain waits for a reply."
                : "Message 1 was sent. Each next message follows once the previous one is read."),
            failedRecipients,
          }),
          tone: counts.failed > 0 ? "warning" : "success",
        });
      } catch (err) {
        console.error("[Broadcast] handleSend chain error:", err);

        await showAlert({
          title: translation("Common.error"),
          message: err.message,
          tone: "danger",
        });
      } finally {
        setSending(false);
        reloadPlanUsage();
      }

      return;
    }

    if (!(await validateContentBeforeAction("send"))) return;

    if (
      !isSurveyMode &&
      !isQuizMode &&
      !isOpenQuestionMode &&
      !trackedLinksValid
    ) {
      await showAlert({
        title: "Invalid tracked links",
        message: "Please complete all tracked links and avoid duplicate keys.",
        tone: "warning",
      });
      return;
    }

    const confirmed = await confirmSendAction();

    if (!confirmed) return;

    setSending(true);

    try {
      const payload = buildBroadcastPayload(selectedUsers);
      const endpoint =
        channel === "whatsapp"
          ? "/api/broadcast/whatsapp"
          : "/api/broadcast/teams";

      const res = await sendProgress.sendRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      if (!res.ok) {
        console.error("Broadcast send error", data);

        if (await showContentLimitAlert(data)) return;

        await showAlert({
          title: translation("Common.error"),
          message:
            typeof data === "object" && data?.error
              ? data.error
              : translation("Common.error"),
          tone: "danger",
        });

        return;
      }

      const counts = getBroadcastCounts(data, selectedUsers.length);
      const failedRecipients = getFailedRecipients(
        data,
        selectedUsers,
        channel,
      );

      await showAlert({
        title:
          counts.failed > 0
            ? "Broadcast completed with issues"
            : "Broadcast sent",
        message: formatBroadcastResultMessage({
          channel,
          action: "sent",
          ok: counts.ok,
          failed: counts.failed,
          note: data?.note || null,
          failedRecipients,
        }),
        tone: counts.failed > 0 ? "warning" : "success",
      });
    } catch (err) {
      console.error("[Broadcast] handleSend error:", err);

      await showAlert({
        title: translation("Common.error"),
        message: err.message,
        tone: "danger",
      });
    } finally {
      setSending(false);
      reloadPlanUsage();
    }
  }

  async function handleSchedule() {
    if (!(await validateTrackedDestinationsBeforeAction())) return;
    if (!isGroupAudience && !selectedUsers.length) {
      await showAlert({
        title: "Choose recipients",
        message: translation("Broadcast.chooseRecipients"),
        tone: "warning",
      });
      return;
    }

    const committed = commitTimeParts(hourDraft, minuteDraft);

    if (!committed) {
      await showAlert({
        title: "Invalid time",
        message: "Please enter a valid time between 08:00 and 20:00.",
        tone: "warning",
      });
      return;
    }

    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
      await showAlert({
        title: "Choose date and time",
        message: "Choose a date and time.",
        tone: "warning",
      });
      return;
    }

    const scheduledDate = new Date(scheduledFor);
    scheduledDate.setHours(Number(hourDraft), Number(minuteDraft), 0, 0);

    if (scheduledDate.getTime() <= Date.now()) {
      await showAlert({
        title: "Invalid schedule date",
        message: "The scheduled date must be in the future.",
        tone: "warning",
      });
      return;
    }

    if (isGroupAudience) {
      await scheduleToGroups(scheduledDate);
      return;
    }

    if (chainMode) {
      if (!readChainsFeatureEnabled) {
        await showAlert({
          title: "Read chains are disabled",
          message: "Enable read chain messages in Automations first.",
          tone: "warning",
        });
        return;
      }

      if (!chainValid) {
        await showAlert({
          title: "Complete the chain",
          message:
            "A scheduled read chain needs 2 to 10 freeform messages, and every message must have text or attachments. Tracked links must also be complete.",
          tone: "warning",
        });
        return;
      }

      const confirmed = await confirmScheduleAction({
        scheduledDate,
        isChain: true,
      });

      if (!confirmed) return;

      setSending(true);

      try {
        const res = await sendProgress.sendRequest("/api/broadcast/read-chain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...buildChainPayload(selectedUsers),
            scheduledFor: scheduledDate.toISOString(),
            timezone: browserTimeZone,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (await showContentLimitAlert(data)) return;
        if (!res.ok) {
          throw new Error(data?.error || "Failed to schedule read chain.");
        }

        const counts = getBroadcastCounts(data, selectedUsers.length);
        const failedRecipients = getFailedRecipients(
          data,
          selectedUsers,
          channel,
        );

        await showAlert({
          title:
            counts.failed > 0
              ? "Read chain scheduled with issues"
              : "Read chain scheduled",
          message: formatBroadcastResultMessage({
            channel,
            action: "scheduled",
            ok: counts.ok,
            failed: counts.failed,
            note:
              data?.note ||
              "Message 1 will be sent at the scheduled time. The next messages will continue after read receipts.",
            failedRecipients,
          }),
          tone: counts.failed > 0 ? "warning" : "success",
        });

        setDeliveryMode("now");
      } catch (err) {
        console.error("[Broadcast] handleSchedule chain error:", err);

        await showAlert({
          title: translation("Common.error"),
          message: err.message,
          tone: "danger",
        });
      } finally {
        setSending(false);
        reloadPlanUsage();
      }

      return;
    }

    if (!(await validateContentBeforeAction("schedule"))) return;

    if (
      !isSurveyMode &&
      !isQuizMode &&
      !isOpenQuestionMode &&
      !trackedLinksValid
    ) {
      await showAlert({
        title: "Invalid tracked links",
        message: "Please complete all tracked links and avoid duplicate keys.",
        tone: "warning",
      });
      return;
    }

    const confirmed = await confirmScheduleAction({
      scheduledDate,
    });

    if (!confirmed) return;

    setSending(true);

    try {
      const payload = buildBroadcastPayload(selectedUsers);

      const res = await sendProgress.sendRequest("/api/broadcast/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: org?.id,
          createdByUserId: user?.id || null,
          channel,
          scheduledFor: scheduledDate.toISOString(),
          timezone: browserTimeZone,
          payload,
          recipientCount: selectedUsers.length,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Schedule broadcast error", data);

        if (await showScheduledLimitAlert(data)) return;
        if (await showContentLimitAlert(data)) return;

        await showAlert({
          title: translation("Common.error"),
          message: data?.error || translation("Common.error"),
          tone: "danger",
        });

        return;
      }

      const counts = getBroadcastCounts(data, selectedUsers.length);
      const failedRecipients = getFailedRecipients(
        data,
        selectedUsers,
        channel,
      );

      await showAlert({
        title:
          counts.failed > 0
            ? "Broadcast scheduled with issues"
            : "Broadcast scheduled",
        message: formatBroadcastResultMessage({
          channel,
          action: "scheduled",
          ok: counts.ok,
          failed: counts.failed,
          note: "These counts mean the broadcast was scheduled for those recipients. Delivery success will only be known when the scheduled broadcast is actually sent.",
          failedRecipients,
        }),
        tone: counts.failed > 0 ? "warning" : "success",
      });

      reloadPlanUsage();
      setDeliveryMode("now");
    } catch (err) {
      console.error(err);

      await showAlert({
        title: translation("Common.error"),
        message: err.message,
        tone: "danger",
      });
    } finally {
      setSending(false);
      reloadPlanUsage();
    }
  }

  const allOnPageSelected =
    filtered.length > 0 && filtered.every((u) => selected.has(u.id));

  const previewTime = useMemo(
    () =>
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [],
  );

  const scheduleDateLabel = scheduledFor.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
  });
  const draftHourNumber = Number(hourDraft);
  const draftMinuteNumber = Number(minuteDraft);
  const hasValidTimeDraft =
    /^\d{1,2}$/.test(hourDraft) &&
    /^\d{1,2}$/.test(minuteDraft) &&
    draftHourNumber >= 0 &&
    draftHourNumber <= 23 &&
    draftMinuteNumber >= 0 &&
    draftMinuteNumber <= 59;
  const scheduleTimeLabel = hasValidTimeDraft
    ? `${String(draftHourNumber).padStart(2, "0")}:${String(
        draftMinuteNumber,
      ).padStart(2, "0")}`
    : `${formatHour(scheduledFor)}:${formatMinute(scheduledFor)}`;
  const scheduleActionLabel = translation("Broadcast.scheduleFor", {
    date: scheduleDateLabel,
    time: scheduleTimeLabel,
  });

  const activeDelay = Number(
    activeChainStep?.delayAfterPreviousReadMinutes || 0,
  );

  const activeDelayParts = splitDelayMinutes(activeDelay);

  const chainDelayTools =
    chainMode && activeChainStepIndex > 0 ? (
      <div className={styles.composerDelayTools}>
        <div className={styles.composerDelayTitle}>
          {translation("Broadcast.broadcastChain.chainDelayBefore")}{" "}
          {activeChainStepIndex + 1}
        </div>

        <div className={styles.composerDelayInputs}>
          <label className={styles.composerDelayField}>
            <span>{translation("Broadcast.broadcastChain.chainHour")}</span>
            <input
              type="number"
              min="0"
              max={MAX_CHAIN_DELAY_HOURS}
              step="1"
              value={activeDelayParts.hours}
              onChange={(event) =>
                updateChainStepDelayPart(
                  activeChainStepIndex,
                  "hours",
                  event.target.value,
                )
              }
            />
          </label>

          <label className={styles.composerDelayField}>
            <span>{translation("Broadcast.broadcastChain.chainMinute")}</span>
            <input
              type="number"
              min="0"
              max="59"
              step="1"
              value={activeDelayParts.minutes}
              onChange={(event) =>
                updateChainStepDelayPart(
                  activeChainStepIndex,
                  "minutes",
                  event.target.value,
                )
              }
            />
          </label>
        </div>

        <div className={styles.composerDelayHelp}>
          {formatDelayLabel(activeDelay, translation)}
        </div>
      </div>
    ) : chainMode && activeChainStepIndex === 0 ? (
      <div className={styles.composerDelayTools}>
        <div className={styles.composerDelayHelp}>
          {translation("Broadcast.broadcastChain.chainFirstMessage")}
        </div>
      </div>
    ) : null;

  const schedulePanel = (
    <SchedulePanel
      scheduledFor={scheduledFor}
      setScheduledFor={setScheduledFor}
      hourDraft={hourDraft}
      minuteDraft={minuteDraft}
      handleHourChange={handleHourChange}
      handleMinuteChange={handleMinuteChange}
      commitTimeParts={commitTimeParts}
      timeError={timeError}
      scheduleInvalid={scheduleInvalid}
      browserTimeZone={browserTimeZone}
      translation={translation}
      usage={
        chainMode ? null : (
          <UsageCounter
            used={planUsage?.scheduledMessages}
            limit={planLimits?.scheduledMessages}
            label={translation("Plans.usage.scheduledLabel")}
            hint={translation("Plans.usage.scheduledHint")}
          />
        )
      }
      limitWarning={
        scheduledFull
          ? translation("Plans.limits.scheduled", {
              limit: planLimits.scheduledMessages,
            })
          : null
      }
    />
  );

  /* Painel dos links rastreados, igual em todos os tipos de mensagem. */
  const linksPanel =
    activeToolPanel === "links" ? (
      <TrackedLinksPanel
        trackedLinks={composerTrackedLinks}
        trackedLinksValid={trackedLinksValid}
        addTrackedLink={addTrackedLink}
        updateTrackedLink={updateTrackedLink}
        removeTrackedLink={removeTrackedLink}
        library={trackedLinkLibrary}
        onUseLibraryLink={addTrackedLinkFromLibrary}
        onDeleteLibraryLink={deleteLibraryLink}
        savedLinks={
          planLimits
            ? {
                used: planUsage?.trackedLinks ?? null,
                limit: planLimits.trackedLinks ?? null,
              }
            : null
        }
        bubbleLinkIds={linkPreview.bubbles.map((bubble) => bubble.id)}
        translation={translation}
      />
    ) : null;

  let composer = null;

  if (showStartMenu) {
    composer = (
      <>
        <StartMenu
          channel={channel}
          onChoose={setComposeMode}
          sampleName={sampleName}
          previewTime={previewTime}
          translation={translation}
        />
        {deliveryMode === "schedule" ? (
          <div className={styles.inlineToolPanel}>{schedulePanel}</div>
        ) : null}
      </>
    );
  } else if (isSurveyMode) {
    composer = (
      <MessageComposer
        title={translation("Broadcast.composer.surveyTitle")}
        onBack={() => setComposeMode(null)}
        activeToolPanel={activeToolPanel}
        toggleToolPanel={toggleToolPanel}
        deliveryMode={deliveryMode}
        setDeliveryMode={setDeliveryMode}
        sending={sending}
        schedulePanel={schedulePanel}
        trackedLinksCount={trackedLinksCount}
        translation={translation}
        phone={
          <SurveyComposer
            variant={isWhatsapp ? "whatsapp" : "teams"}
            survey={survey}
            onChange={setSurvey}
            contactName={sampleName}
            previewTime={previewTime}
            tools={composerTools}
            translation={translation}
          />
        }
      >
        {linksPanel}
      </MessageComposer>
    );
  } else if (isOpenQuestionMode) {
    composer = (
      <MessageComposer
        title={translation("Broadcast.start.question")}
        onBack={() => setComposeMode(null)}
        activeToolPanel={activeToolPanel}
        toggleToolPanel={toggleToolPanel}
        deliveryMode={deliveryMode}
        setDeliveryMode={setDeliveryMode}
        sending={sending}
        schedulePanel={schedulePanel}
        trackedLinksCount={trackedLinksCount}
        translation={translation}
        phone={
          <OpenQuestionComposer
            variant={isWhatsapp ? "whatsapp" : "teams"}
            question={openQuestion}
            onChange={setOpenQuestion}
            contactName={sampleName}
            previewTime={previewTime}
            tools={composerTools}
            translation={translation}
          />
        }
      >
        {linksPanel}
      </MessageComposer>
    );
  } else if (isQuizMode) {
    composer = (
      <MessageComposer
        title={translation("Broadcast.composer.quizTitle")}
        onBack={() => setComposeMode(null)}
        activeToolPanel={activeToolPanel}
        toggleToolPanel={toggleToolPanel}
        deliveryMode={deliveryMode}
        setDeliveryMode={setDeliveryMode}
        sending={sending}
        schedulePanel={schedulePanel}
        trackedLinksCount={trackedLinksCount}
        translation={translation}
        phone={
          <QuizComposer
            variant={isWhatsapp ? "whatsapp" : "teams"}
            quiz={quiz}
            onChange={setQuiz}
            contactName={sampleName}
            previewTime={previewTime}
            tools={composerTools}
            translation={translation}
          />
        }
      >
        {linksPanel}
      </MessageComposer>
    );
  } else {
    composer = (
      <MessageComposer
        title={translation("Broadcast.message")}
        onBack={() => setComposeMode(null)}
        hint={chainQuestionKind ? null : translation("Broadcast.composer.hint")}
        warning={composerWarning}
        activeToolPanel={activeToolPanel}
        toggleToolPanel={toggleToolPanel}
        deliveryMode={deliveryMode}
        setDeliveryMode={setDeliveryMode}
        sending={sending}
        schedulePanel={schedulePanel}
        trackedLinksCount={trackedLinksCount}
        translation={translation}
        leftToolsContent={chainDelayTools}
        showLinks={!isGroupAudience}
        chainControls={
          isGroupAudience ? null : (
            <ChainMessagesBar
              enabled={readChainsFeatureEnabled}
              chainMode={chainMode}
              setChainMode={setChainMode}
              chainSteps={chainSteps}
              activeChainStepIndex={activeChainStepIndex}
              setActiveChainStepIndex={setActiveChainStepIndex}
              addChainStep={addChainStep}
              duplicateChainStep={duplicateChainStep}
              removeChainStep={removeChainStep}
              activeStepKind={activeChainStep?.kind || "message"}
              onChangeStepKind={(kind) =>
                updateChainStepKind(activeChainStepIndex, kind)
              }
              maxSteps={chainStepsLimit}
              translation={translation}
            />
          )
        }
        phone={
          chainQuestionKind === "quiz" ? (
            <QuizComposer
              variant={isWhatsapp ? "whatsapp" : "teams"}
              quiz={activeChainStep.quiz}
              onChange={(next) => updateActiveChainStep({ quiz: next })}
              contactName={sampleName}
              previewTime={previewTime}
              tools={composerTools}
              translation={translation}
            />
          ) : chainQuestionKind === "survey" ? (
            <SurveyComposer
              variant={isWhatsapp ? "whatsapp" : "teams"}
              survey={activeChainStep.survey}
              onChange={(next) => updateActiveChainStep({ survey: next })}
              contactName={sampleName}
              previewTime={previewTime}
              tools={composerTools}
              translation={translation}
            />
          ) : chainQuestionKind === "open" ? (
            <OpenQuestionComposer
              variant={isWhatsapp ? "whatsapp" : "teams"}
              question={activeChainStep.openQuestion}
              onChange={(next) => updateActiveChainStep({ openQuestion: next })}
              contactName={sampleName}
              previewTime={previewTime}
              tools={composerTools}
              translation={translation}
            />
          ) : (
            <PhoneComposer
              channel={channel}
              contactName={sampleName}
              message={composerMessage}
              onMessageChange={setComposerMessage}
              tools={composerTools}
              previewTime={previewTime}
              translation={translation}
            />
          )
        }
      >
        {linksPanel}
      </MessageComposer>
    );
  }

  return (
    <div className={styles.screen}>
      <BroadcastHeader
        channel={channel}
        setChannel={setChannel}
        selectedCount={isGroupAudience ? selectedGroups.size : selected.size}
        sending={sending}
        canSend={canSend}
        dailyCounter={
          <UsageCounter
            used={dailySendsUsed}
            limit={dailySendsLimit}
            label={translation("Plans.usage.dailyLabel")}
            hint={translation("Plans.usage.dailyHint", {
              time: dailySendsResetTime,
            })}
          />
        }
        dailyCounterLabel={
          dailySendsLimit !== null && dailySendsUsed !== null
            ? translation("Plans.usage.dailyShort")
            : null
        }
        deliveryMode={deliveryMode}
        scheduleActionLabel={scheduleActionLabel}
        onPrimaryClick={
          deliveryMode === "schedule" ? handleSchedule : handleSend
        }
        translation={translation}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={BROADCAST_MEDIA_ACCEPT.image}
        multiple
        hidden
        data-testid="file-input"
        onChange={handlePickFiles}
      />

      {mediaPickerKind ? (
        <MediaPickerModal
          kind={mediaPickerKind}
          orgId={org?.id}
          attachedUrls={composerFiles.map((f) => f.url)}
          onAdd={async (picked) => {
            /* Ficheiros por mensagem (#187): a escolha a mais fica por juntar. */
            if (!(await acceptComposerFiles(picked.length))) return false;

            /* No WhatsApp, as imagens acima de 5 MB não chegam ao contacto. */
            const tooLarge =
              channel === "whatsapp"
                ? picked.find(isWhatsappImageTooLarge)
                : null;
            if (tooLarge) {
              await showAlert({
                title: translation("Common.error"),
                message: translation(
                  "Broadcast.composer.whatsappImageTooLarge",
                  { name: tooLarge.name },
                ),
                tone: "warning",
              });
              return false;
            }

            setComposerFiles((prev) => [...prev, ...picked]);
            return true;
          }}
          onClose={() => setMediaPickerKind(null)}
          translation={translation}
        />
      ) : null}

      <input
        ref={thumbInputRef}
        type="file"
        accept={BROADCAST_MEDIA_ACCEPT.image}
        hidden
        onChange={handlePickThumbnail}
      />

      {sendProgress.waiting && (
        <SendingBanner
          count={selected.size}
          deliveryMode={deliveryMode}
          translation={translation}
        />
      )}

      {/* Enquanto o servidor não responde, a mensagem e os destinatários não mudam. */}
      <div
        className={styles.columns}
        inert={sendProgress.waiting}
        aria-busy={sendProgress.waiting}
        data-testid="broadcast-columns"
      >
        <div className={styles.leftCol}>{composer}</div>

        <div className={styles.rightCol}>
          {channel === "teams" && (
            <AudienceTabs
              audience={audience}
              canUseGroups={canUseGroups}
              onChooseUsers={() => setAudience("users")}
              onChooseGroups={chooseGroupAudience}
              translation={translation}
            />
          )}

          {isGroupAudience ? (
            <GroupsPanel
              groups={filteredGroups}
              q={groupQuery}
              setQ={setGroupQuery}
              selected={selectedGroups}
              toggleOne={toggleGroup}
              toggleAll={toggleAllGroups}
              allSelected={allGroupsSelected}
              translation={translation}
            />
          ) : (
            <RecipientsPanel
              filterBtnRef={filterBtnRef}
              filterOpen={filterOpen}
              setFilterOpen={setFilterOpen}
              activeFilterCount={activeFilterCount}
              allTags={allTags}
              assistantsList={assistantsList}
              selectedTagIds={selectedTagIds}
              setSelectedTagIds={setSelectedTagIds}
              selectedAssistantIds={selectedAssistantIds}
              setSelectedAssistantIds={setSelectedAssistantIds}
              q={q}
              setQ={setQ}
              filtered={filtered}
              selected={selected}
              toggleOne={toggleOne}
              toggleAllCurrent={toggleAllCurrent}
              allOnPageSelected={allOnPageSelected}
              channel={channel}
              translation={translation}
            />
          )}
        </div>
      </div>
    </div>
  );
}
