"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { resetSession } from "@/mock/session-store";
import { getDemoScript, resolveRoute, type DemoScript, type DemoStep } from "@/lib/demo/scripts";
import { useSession } from "@/store/session";

/**
 * Clears every mutation made during a demo run — intake decisions, case
 * overrides, agent runs, action requests — by resetting the in-memory session
 * overlay and dropping the query cache. This is the demo's "reset" behaviour
 * (mock/session-store.ts) made available to the UI.
 */
export function useResetDemoState() {
  const qc = useQueryClient();
  return React.useCallback(() => {
    resetSession();
    qc.clear();
  }, [qc]);
}

export interface GuidedDemo {
  script: DemoScript | null;
  step: DemoStep | null;
  stepIndex: number;
  total: number;
  running: boolean;
  busy: boolean;
  error?: string;
  atStart: boolean;
  atEnd: boolean;
  start: (scriptId: string) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  restart: () => Promise<void>;
  resume: () => void;
  exit: () => void;
}

export function useGuidedDemo(): GuidedDemo {
  const router = useRouter();
  const qc = useQueryClient();
  const guidedDemo = useSession((s) => s.guidedDemo);
  const [busy, setBusy] = React.useState(false);

  const script = guidedDemo ? getDemoScript(guidedDemo.scriptId) ?? null : null;
  const stepIndex = guidedDemo?.stepIndex ?? 0;
  const total = script?.steps.length ?? 0;
  const step = script?.steps[stepIndex] ?? null;

  /** sign in as the step's persona (if different), run its action, navigate. */
  const applyStep = React.useCallback(
    async (target: DemoStep, targetIndex: number, activeScript: DemoScript) => {
      const s = useSession.getState();
      if (s.userId !== target.persona) s.signIn(target.persona, activeScript.tenantId);
      const ctx = { userId: target.persona, tenantId: activeScript.tenantId };

      if (target.action) {
        const produced = await target.action({ ctx, vars: useSession.getState().guidedDemo?.vars ?? {} });
        if (produced) useSession.getState().setDemoVars(produced);
      }
      await qc.invalidateQueries();

      useSession.getState().setDemoStep(targetIndex);
      const vars = useSession.getState().guidedDemo?.vars ?? {};
      router.push(resolveRoute(target.route, vars));
    },
    [qc, router],
  );

  const start = React.useCallback(
    async (scriptId: string) => {
      const activeScript = getDemoScript(scriptId);
      if (!activeScript) return;
      setBusy(true);
      try {
        useSession.getState().startDemo(scriptId);
        await applyStep(activeScript.steps[0], 0, activeScript);
      } catch (e) {
        useSession.getState().setDemoStatus("error", errText(e));
      } finally {
        setBusy(false);
      }
    },
    [applyStep],
  );

  const goTo = React.useCallback(
    async (targetIndex: number) => {
      if (!script || !guidedDemo) return;
      const target = script.steps[targetIndex];
      if (!target) return;
      setBusy(true);
      try {
        await applyStep(target, targetIndex, script);
      } catch (e) {
        useSession.getState().setDemoStatus("error", errText(e));
      } finally {
        setBusy(false);
      }
    },
    [script, guidedDemo, applyStep],
  );

  const next = React.useCallback(() => goTo(stepIndex + 1), [goTo, stepIndex]);
  const prev = React.useCallback(() => goTo(stepIndex - 1), [goTo, stepIndex]);

  const restart = React.useCallback(async () => {
    if (!script) return;
    setBusy(true);
    try {
      resetSession();
      qc.clear();
      useSession.getState().startDemo(script.id);
      await applyStep(script.steps[0], 0, script);
    } catch (e) {
      useSession.getState().setDemoStatus("error", errText(e));
    } finally {
      setBusy(false);
    }
  }, [script, qc, applyStep]);

  const resume = React.useCallback(() => {
    if (!script || !step) return;
    const s = useSession.getState();
    if (s.userId !== step.persona) s.signIn(step.persona, script.tenantId);
    router.push(resolveRoute(step.route, guidedDemo?.vars ?? {}));
  }, [script, step, guidedDemo, router]);

  const exit = React.useCallback(() => useSession.getState().exitDemo(), []);

  return {
    script,
    step,
    stepIndex,
    total,
    running: !!guidedDemo && !!script,
    busy,
    error: guidedDemo?.status === "error" ? guidedDemo.error : undefined,
    atStart: stepIndex === 0,
    atEnd: total > 0 && stepIndex >= total - 1,
    start,
    next,
    prev,
    restart,
    resume,
    exit,
  };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
