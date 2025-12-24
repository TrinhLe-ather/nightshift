/**
 * Notifications Hook
 *
 * Manages browser notifications for task events.
 * Features: permission request, task completion/failure/needs-input notifications.
 */

import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Task } from "@/web/api/client";

interface UseNotificationsOptions {
  enabled?: boolean;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { enabled = true } = options;
  const navigate = useNavigate();
  const previousTasksRef = useRef<Map<number, string>>(new Map());

  // Request notification permission on mount
  useEffect(() => {
    if (!enabled) return;

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  const canNotify = useCallback(() => {
    return enabled && "Notification" in window && Notification.permission === "granted";
  }, [enabled]);

  const showNotification = useCallback(
    (title: string, body: string, taskId?: number) => {
      if (!canNotify()) return;

      const notification = new Notification(title, {
        body,
        icon: "/nightshift.svg",
        tag: taskId ? `task-${taskId}` : undefined,
      });

      notification.onclick = () => {
        window.focus();
        if (taskId) {
          navigate(`/tasks/${taskId}`);
        }
        notification.close();
      };

      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000);
    },
    [canNotify, navigate],
  );

  const notifyTaskCompleted = useCallback(
    (task: Task) => {
      const prompt = task.prompt.length > 50 ? task.prompt.substring(0, 50) + "..." : task.prompt;
      showNotification("Task completed", prompt, task.id);
    },
    [showNotification],
  );

  const notifyTaskFailed = useCallback(
    (task: Task) => {
      const prompt = task.prompt.length > 50 ? task.prompt.substring(0, 50) + "..." : task.prompt;
      showNotification("Task failed", prompt, task.id);
    },
    [showNotification],
  );

  const notifyTaskNeedsInput = useCallback(
    (task: Task) => {
      const prompt = task.prompt.length > 50 ? task.prompt.substring(0, 50) + "..." : task.prompt;
      showNotification("Task needs input", prompt, task.id);
    },
    [showNotification],
  );

  /**
   * Check for task status changes and notify
   */
  const checkTaskChanges = useCallback(
    (tasks: Task[]) => {
      if (!canNotify()) return;

      for (const task of tasks) {
        const previousStatus = previousTasksRef.current.get(task.id);

        // Only notify on status change, not on first load
        if (previousStatus && previousStatus !== task.status) {
          switch (task.status) {
            case "COMPLETED":
              notifyTaskCompleted(task);
              break;
            case "FAILED":
              notifyTaskFailed(task);
              break;
            case "NEEDS_HUMAN":
              notifyTaskNeedsInput(task);
              break;
          }
        }

        previousTasksRef.current.set(task.id, task.status);
      }
    },
    [canNotify, notifyTaskCompleted, notifyTaskFailed, notifyTaskNeedsInput],
  );

  return {
    canNotify: canNotify(),
    showNotification,
    notifyTaskCompleted,
    notifyTaskFailed,
    notifyTaskNeedsInput,
    checkTaskChanges,
  };
}
