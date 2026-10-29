import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgForAssistant: vi.fn(),
  getStoreById: vi.fn(),
  updateStoreName: vi.fn(),
  createDBFiles: vi.fn(),
  deleteFileById: vi.fn(),
  uploadOpenAiFilesFromStorage: vi.fn(),
  attachOpenAiFileToVectorStore: vi.fn(),
  detachOpenAiFileFromVectorStore: vi.fn(),
  deleteOpenAiFile: vi.fn(),
  updateOpenAiVectorStore: vi.fn(),
  deleteOpenAiVectorStoreAndFiles: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOrgForAssistant: mocks.requireOrgForAssistant,
  handleApiError(error, fallback) {
    const status = error?.status || 500;
    return Response.json(
      { error: status >= 500 ? fallback : error.message },
      { status },
    );
  },
}));

/* Os limites do plano têm testes próprios (assistantContentLimits); aqui, sem limites. */
vi.mock("@/lib/services/plans/planLimits", async (importOriginal) => ({
  ...(await importOriginal()),
  getOrgLimits: vi.fn(async () => ({
    plan: { id: 4, name: "Enterprise", level: 4 },
    limits: { filesPerAssistant: null },
  })),
}));

vi.mock("@/lib/repos/store.repo", () => ({
  getStoreById: mocks.getStoreById,
  updateStoreName: mocks.updateStoreName,
  deleteStoreById: vi.fn(),
}));

vi.mock("@/lib/repos/files.repo", () => ({
  createDBFiles: mocks.createDBFiles,
  deleteFileById: mocks.deleteFileById,
}));

vi.mock("@/lib/repos/assistants.repo", () => ({
  nullifyVectorStoreToDbAssistant: vi.fn(),
}));

vi.mock("@/lib/services/openaiFiles.service", () => ({
  uploadOpenAiFilesFromStorage: mocks.uploadOpenAiFilesFromStorage,
  attachOpenAiFileToVectorStore: mocks.attachOpenAiFileToVectorStore,
  detachOpenAiFileFromVectorStore: mocks.detachOpenAiFileFromVectorStore,
  deleteOpenAiFile: mocks.deleteOpenAiFile,
  updateOpenAiVectorStore: mocks.updateOpenAiVectorStore,
  deleteOpenAiVectorStoreAndFiles: mocks.deleteOpenAiVectorStoreAndFiles,
}));

import { PATCH } from "@/app/api/assistants/[assistantId]/vector-store/[storeId]/route";

function request(body) {
  return new Request(
    "http://localhost/api/assistants/7/vector-store/11",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const initialStore = {
  id: 11,
  store_name: "Original docs",
  open_ai_id: "vs_existing",
  file: [{ id: 3, open_ai_id: "file_old", name: "old.pdf", size: 10 }],
};

const updatedStore = {
  ...initialStore,
  store_name: "Updated docs",
  file: [
    { id: 4, open_ai_id: "file_new", name: "new.pdf", size: 20 },
  ],
};

describe("PATCH /api/assistants/[assistantId]/vector-store/[storeId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireOrgForAssistant.mockResolvedValue({
      assistantId: 7,
      orgId: 9,
      assistant: { vector_store_id: 11 },
    });
    mocks.getStoreById
      .mockResolvedValueOnce(initialStore)
      .mockResolvedValueOnce(updatedStore);
    mocks.uploadOpenAiFilesFromStorage.mockResolvedValue({
      fileIds: ["file_new"],
      fileRows: [
        { open_ai_id: "file_new", name: "new.pdf", size: 20 },
      ],
    });
  });

  it("updates the same OpenAI vector store and synchronizes local files", async () => {
    const response = await PATCH(
      request({
        storeName: "Updated docs",
        files: [
          {
            bucket: "assistant-uploads",
            path: "9/7/new.pdf",
            name: "new.pdf",
            size: 20,
          },
        ],
        removedFileIds: [3],
      }),
      { params: Promise.resolve({ assistantId: "7", storeId: "11" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 11,
      storeName: "Updated docs",
      files: [{ id: 4, name: "new.pdf", size: 20 }],
    });

    expect(mocks.uploadOpenAiFilesFromStorage).toHaveBeenCalledWith(
      expect.any(Array),
      9,
    );
    expect(mocks.attachOpenAiFileToVectorStore).toHaveBeenCalledWith(
      "vs_existing",
      "file_new",
    );
    expect(mocks.detachOpenAiFileFromVectorStore).toHaveBeenCalledWith(
      "vs_existing",
      "file_old",
    );
    expect(mocks.deleteOpenAiFile).toHaveBeenCalledWith("file_old");
    expect(mocks.updateOpenAiVectorStore).toHaveBeenCalledWith(
      "vs_existing",
      { name: "Updated docs" },
    );
    expect(mocks.updateStoreName).toHaveBeenCalledWith(11, "Updated docs");
    expect(mocks.createDBFiles).toHaveBeenCalledWith(
      [{ open_ai_id: "file_new", name: "new.pdf", size: 20 }],
      11,
    );
    expect(mocks.deleteFileById).toHaveBeenCalledWith(3);
  });

  it("does not allow a file from another vector store to be removed", async () => {
    const response = await PATCH(
      request({ storeName: "Original docs", files: [], removedFileIds: [99] }),
      { params: Promise.resolve({ assistantId: "7", storeId: "11" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.uploadOpenAiFilesFromStorage).not.toHaveBeenCalled();
    expect(mocks.detachOpenAiFileFromVectorStore).not.toHaveBeenCalled();
    expect(mocks.deleteFileById).not.toHaveBeenCalled();
  });

  it("does not expose a different assistant's vector store", async () => {
    mocks.requireOrgForAssistant.mockResolvedValue({
      assistantId: 7,
      orgId: 9,
      assistant: { vector_store_id: 12 },
    });

    const response = await PATCH(
      request({ storeName: "Attacker", files: [], removedFileIds: [] }),
      { params: Promise.resolve({ assistantId: "7", storeId: "11" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.getStoreById).not.toHaveBeenCalled();
    expect(mocks.updateOpenAiVectorStore).not.toHaveBeenCalled();
  });
});
