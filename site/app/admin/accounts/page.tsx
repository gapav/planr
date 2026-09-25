"use client";

import { AdminAccountDirectory } from "@/components/admin-account-directory";
import { AdminFrame, AdminHeader } from "@/components/admin-frame";
import { useGrep } from "@/components/app-provider";

export default function AdminAccountsPage() {
  return <AdminFrame><AdminAccounts /></AdminFrame>;
}

function AdminAccounts() {
  const { user, adminAccounts, adminAccountsLoaded, deleteAccountPermanently, adminSetDisplayName } = useGrep();
  return <>
    <AdminHeader section="accounts" title="Brukerkontoer" description="Å fjerne en trener fra et lag endrer bare lagtilgangen. Permanent sletting gjøres her og beholder økter og øvelser anonymisert som «Slettet bruker»." />
    <AdminAccountDirectory accounts={adminAccounts} loaded={adminAccountsLoaded} currentUserId={user?.id ?? ""} onDelete={deleteAccountPermanently} onRename={adminSetDisplayName} />
  </>;
}
