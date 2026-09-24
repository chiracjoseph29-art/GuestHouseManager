"use client";

import { useEffect, useState } from "react";
import { api, apiForm } from "@/lib/api-client";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { RoomInventoryChecklist } from "@/components/room-inventory-checklist";
import { useSession } from "@/hooks/use-session";
import { submitRoomInventoryVerifications } from "@/lib/room-inventory-verify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Task = {
  id: string;
  status: string;
  completionPhotoId?: string | null;
  room: { id: string; name: string };
  photos?: { fileId: string }[];
};

const MAX_UPLOAD_BYTES = 5_242_880;

function statusBadgeVariant(status: string) {
  if (status === "COMPLETED") return "secondary";
  if (status === "IN_PROGRESS") return "default";
  return "outline";
}

export default function CleaningPage() {
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [attachedPhotoIds, setAttachedPhotoIds] = useState<Record<string, string>>({});
  const [foundByTask, setFoundByTask] = useState<Record<string, Record<string, string>>>({});
  const [roomCleaned, setRoomCleaned] = useState<Record<string, boolean>>({});
  const [inventoryChecked, setInventoryChecked] = useState<Record<string, boolean>>({});

  async function load() {
    const res = await api<{ tasks: Task[] }>("/api/v1/cleaning/tasks");
    setTasks(res.data.tasks);
    setAttachedPhotoIds((prev) => {
      const next = { ...prev };
      for (const task of res.data.tasks) {
        const fromServer = task.completionPhotoId ?? task.photos?.[0]?.fileId;
        if (fromServer && task.status === "IN_PROGRESS") {
          next[task.id] = fromServer;
        }
        if (task.status === "COMPLETED") {
          delete next[task.id];
        }
      }
      return next;
    });
  }

  useEffect(() => {
    load().catch(() => toast.error("Could not load tasks."));
  }, []);

  useEffect(() => {
    return () => {
      for (const url of Object.values(previewUrls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [previewUrls]);

  async function confirmDeleteTask() {
    if (!deleteTask) return;
    setDeletingTask(true);
    try {
      await api(`/api/v1/cleaning/tasks?id=${deleteTask.id}&permanent=1`, { method: "DELETE" });
      toast.success("Cleaning task deleted.");
      setDeleteTask(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete cleaning task.");
    } finally {
      setDeletingTask(false);
    }
  }

  async function startTask(id: string) {
    setLoadingId(id);
    try {
      await api("/api/v1/cleaning/tasks", {
        method: "PATCH",
        body: JSON.stringify({ action: "start", taskId: id }),
      });
      toast.success("Cleaning started.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start cleaning.");
    } finally {
      setLoadingId(null);
    }
  }

  function choosePhoto(taskId: string, file: File | undefined) {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      toast.error("Use JPEG, PNG, or WebP images only.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Image is too large (max 5 MB).");
      return;
    }
    setPendingFiles((p) => ({ ...p, [taskId]: file }));
    setPreviewUrls((prev) => {
      const old = prev[taskId];
      if (old) URL.revokeObjectURL(old);
      return { ...prev, [taskId]: URL.createObjectURL(file) };
    });
    toast.message("Photo selected. Click Complete cleaning when ready.");
  }

  function hasPhotoReady(task: Task): boolean {
    return Boolean(pendingFiles[task.id] || attachedPhotoIds[task.id] || task.photos?.length);
  }

  function completionPhotoId(task: Task): string | undefined {
    return task.completionPhotoId ?? attachedPhotoIds[task.id] ?? task.photos?.[0]?.fileId;
  }

  async function completeTask(task: Task) {
    const id = task.id;
    if (!roomCleaned[id]) {
      toast.error("Confirm the room has been cleaned.");
      return;
    }
    if (!inventoryChecked[id]) {
      toast.error("Confirm room inventory has been checked.");
      return;
    }
    setLoadingId(id);
    try {
      let fileId = attachedPhotoIds[id] ?? task.photos?.[0]?.fileId;
      const localFile = pendingFiles[id];
      if (localFile) {
        const form = new FormData();
        form.append("file", localFile);
        form.append("purpose", "CLEANING_PHOTO");
        const uploaded = await apiForm<{ fileId: string }>("/api/v1/files", form);
        fileId = uploaded.data.fileId;
        await api("/api/v1/cleaning/tasks", {
          method: "PATCH",
          body: JSON.stringify({ action: "attach_photo", taskId: id, fileId }),
        });
      }
      if (!fileId) {
        toast.error("A completion photo is required.");
        return;
      }

      const rowsRes = await api<{
        roomInventory: { id: string; expectedQuantity: number; item: { id: string; name: string } }[];
      }>(`/api/v1/room-inventory?roomId=${task.room.id}`);
      const rows = rowsRes.data.roomInventory;
      if (rows.length > 0) {
        const foundQty = foundByTask[id] ?? {};
        const { discrepancies } = await submitRoomInventoryVerifications({
          roomId: task.room.id,
          rows,
          foundQty,
          photoFileId: fileId,
          cleaningTaskId: id,
        });
        if (discrepancies > 0) {
          toast.message(`${discrepancies} inventory discrepancy(ies) recorded.`);
        }
      }

      await api("/api/v1/cleaning/tasks", {
        method: "PATCH",
        body: JSON.stringify({ action: "complete", taskId: id }),
      });
      toast.success("Cleaning completed.");
      setPendingFiles((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      setPreviewUrls((prev) => {
        const next = { ...prev };
        const url = next[id];
        if (url) URL.revokeObjectURL(url);
        delete next[id];
        return next;
      });
      setAttachedPhotoIds((a) => {
        const next = { ...a };
        delete next[id];
        return next;
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete cleaning.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cleaning tasks</h1>
        <p className="mt-1 text-sm text-slate-600">
          Start cleaning → check room inventory → upload completion photo → complete
        </p>
      </div>
      {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks assigned.</p>}
      {tasks.map((task) => {
        const isCompleted = task.status === "COMPLETED";
        const inProgress = task.status === "IN_PROGRESS";
        const pending = task.status === "PENDING";
        const photoId = completionPhotoId(task);
        const preview = previewUrls[task.id];
        const photoAttached = hasPhotoReady(task);
        const foundQty = foundByTask[task.id] ?? {};

        return (
          <Card key={task.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">{task.room.name}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={statusBadgeVariant(task.status)}>
                  {task.status.replace(/_/g, " ")}
                </Badge>
                {isAdmin && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={loadingId === task.id}
                    onClick={() => setDeleteTask(task)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {pending && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">Ready to clean this room.</p>
                  <Button disabled={loadingId === task.id} onClick={() => startTask(task.id)}>
                    Start cleaning
                  </Button>
                </div>
              )}

              {inProgress && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-amber-900">Cleaning in progress</p>

                  <div className="space-y-2 text-sm">
                    <p className="font-medium">Cleaning checklist</p>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={roomCleaned[task.id] ?? false}
                        onChange={(e) =>
                          setRoomCleaned((c) => ({ ...c, [task.id]: e.target.checked }))
                        }
                      />
                      Room cleaned
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={inventoryChecked[task.id] ?? false}
                        onChange={(e) =>
                          setInventoryChecked((c) => ({ ...c, [task.id]: e.target.checked }))
                        }
                      />
                      Room inventory checked
                    </label>
                  </div>

                  <RoomInventoryChecklist
                    roomId={task.room.id}
                    compact
                    foundQty={foundQty}
                    onFoundQtyChange={(next) =>
                      setFoundByTask((f) => ({ ...f, [task.id]: next }))
                    }
                  />

                  <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-3">
                    <p className="text-sm font-medium">Completion photo (required)</p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loadingId === task.id}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/jpeg,image/png,image/webp";
                        input.capture = "environment";
                        input.onchange = () => {
                          choosePhoto(task.id, input.files?.[0]);
                          input.value = "";
                        };
                        input.click();
                      }}
                    >
                      Upload completion photo
                    </Button>
                    {(preview || (photoAttached && photoId && !preview)) && (
                      <div className="space-y-1">
                        <img
                          src={preview ?? `/api/v1/files?id=${photoId}`}
                          alt="Completion photo preview"
                          className="max-h-48 rounded-md border object-cover"
                        />
                        <p className="text-xs font-medium text-green-700">Photo attached</p>
                      </div>
                    )}
                  </div>

                  <Button
                    disabled={
                      loadingId === task.id ||
                      !photoAttached ||
                      !roomCleaned[task.id] ||
                      !inventoryChecked[task.id]
                    }
                    onClick={() => void completeTask(task)}
                  >
                    Complete cleaning
                  </Button>
                </div>
              )}

              {isCompleted && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-green-700">✓ Cleaning completed</p>
                  {photoId && (
                    <img
                      src={`/api/v1/files?id=${photoId}`}
                      alt="Cleaning completion"
                      className="max-h-48 rounded-md border object-cover"
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <ConfirmDeleteDialog
        open={Boolean(deleteTask)}
        onOpenChange={(open) => !open && setDeleteTask(null)}
        title="Delete cleaning task?"
        description={
          deleteTask ? (
            <p className="text-sm">
              Permanently delete this cleaning task? This will remove the cleaning record and associated
              cleaning photos/files and cannot be undone.
              <span className="mt-2 block font-medium text-slate-800">{deleteTask.room.name}</span>
            </p>
          ) : null
        }
        confirmLabel="Delete task"
        loading={deletingTask}
        onConfirm={() => void confirmDeleteTask()}
      />
    </div>
  );
}
