import Elysia from "elysia";
import listOrgsEndpoint from "./list";
import createOrgEndpoint from "./create";
import orgDetailsEndpoint from "./details";
import patchOrgEndpoint from "./update";
import deleteOrgEndpoint from "./remove";
import orgMembersEndpoint from "./members/index";
import orgInvitesEndpoint from "./invites/index";
import orgPermissionsEndpoint from "./permissions/index";
import orgAuditEndpoint from "./audit/index";
import orgTransactionsEndpoint from "./transactions/index";
import transferOrgEndpoint from "./transfer";
import leaveOrgEndpoint from "./leave";
import tinyUserEndpoint from "./users/tiny";

export const OrgRouter = new Elysia({ prefix: "/org" })
  .use(listOrgsEndpoint)
  .use(createOrgEndpoint)
  .use(orgDetailsEndpoint)
  .use(patchOrgEndpoint)
  .use(deleteOrgEndpoint)
  .use(transferOrgEndpoint)
  .use(leaveOrgEndpoint)
  .use(orgMembersEndpoint)
  .use(orgInvitesEndpoint)
  .use(orgPermissionsEndpoint)
  .use(orgAuditEndpoint)
  .use(orgTransactionsEndpoint)
  .use(tinyUserEndpoint);

export default OrgRouter;
