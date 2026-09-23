"use client";
import AuthModal from "@/components/AuthModal";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import SettingsModal from "@/components/SettingsModal";
import Toaster from "@/components/Toaster";
import SessionBootstrap from "@/components/SessionBootstrap";
import { useWorkflowStore } from "@/lib/store";

export default function GlobalModals() {
  const settingsOpen    = useWorkflowStore((s) => s.settingsOpen);
  const setSettingsOpen = useWorkflowStore((s) => s.setSettingsOpen);

  return (
    <>
      <SessionBootstrap />
      <AuthModal />
      <ResetPasswordModal />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <Toaster />
    </>
  );
}
