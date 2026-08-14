import { InvitationManager } from "@/components/invitation-manager";
import { requireSuperAdmin } from "@/lib/auth";
import { listInvitations } from "@/lib/data";

export default async function InvitationsPage() {
  await requireSuperAdmin();
  return <InvitationManager initialItems={await listInvitations()} />;
}
