"use client";

import { useEffect, useState } from "react";
import { api, apiForm } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Task = {
  id: string;
  status: string;
  room: { name: string };
};

export default function CleaningPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function load() {
    const res = await api<{ tasks: Task[] }>("/api/v1/cleaning/tasks");
    setTasks(res.data.tasks);
  }

  useEffect(() => {
    load().catch(() => toast.error("Could not load tasks."));
  }, []);

  async function startTask(id: string) {
    setLoadingId(id);
    try {
      await api("/api/v1/cleaning/tasks", {
        method: "PATCH",
        body: JSON.stringify({ action: "start", taskId: id }),
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setLoadingId(null);
    }
  }

  async function uploadAndComplete(id: string, file: File) {
    setLoadingId(id);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", "CLEANING_PHOTO");
      const uploaded = await apiForm<{ fileId: string }>("/api/v1/files", form);
      await api("/api/v1/cleaning/tasks", {
        method: "PATCH",
        body: JSON.stringify({ action: "attach_photo", taskId: id, fileId: uploaded.data.fileId }),
      });
      await api("/api/v1/cleaning/tasks", {
        method: "PATCH",
        body: JSON.stringify({ action: "complete", taskId: id }),
      });
      toast.success("Room marked cleaned.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Completion requires a valid photo.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Cleaning tasks</h1>
      <p className="text-sm text-slate-600">Upload a photo before completing each task.</p>
      {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks assigned.</p>}
      {tasks.map((task) => (
        <Card key={task.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{task.room.name}</CardTitle>
            <Badge variant="outline">{task.status.replace(/_/g, " ")}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {task.status === "PENDING" && (
              <Button disabled={loadingId === task.id} onClick={() => startTask(task.id)}>
                Start cleaning
              </Button>
            )}
            {(task.status === "IN_PROGRESS" || task.status === "PENDING") && (
              <div>
                <label className="block text-sm font-medium">Completion photo</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadAndComplete(task.id, file);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
