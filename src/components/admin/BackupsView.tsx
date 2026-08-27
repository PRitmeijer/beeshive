import React from "react";
import { redirect } from "next/navigation";
import type { AdminViewProps, ServerProps } from "payload";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter, SetStepNav } from "@payloadcms/ui";

import { BackupPanel } from "./BackupPanel";

/**
 * /admin/backups — the chrome around BackupPanel, and the sidebar link that
 * makes it findable.
 *
 * Both halves of this file exist because of the same two properties of
 * Payload 3.88's custom views, which AgendaView ran into first and which are
 * worth repeating rather than cross-referencing.
 *
 * A custom view gets no template. getViewFromConfig leaves `templateType`
 * undefined for anything under `admin.components.views`, so a view that does
 * not render DefaultTemplate itself arrives as a bare page with no navigation
 * and no way back — which reads as a broken deploy at exactly the moment
 * nobody can afford to wonder whether the deploy is broken. The template needs
 * the Payload instance, so this has to be a server component and the browser
 * half lives in BackupPanel.
 *
 * And a custom view is a *public* route as far as initPage is concerned (see
 * isCustomAdminView in @payloadcms/next): Payload will not bounce an anonymous
 * visitor to the login screen the way it does for a collection. The guard below
 * is the only thing that does. /api/admin/backups repeats the check for itself,
 * because a page that merely looks empty to a stranger is not the same as data
 * a stranger cannot fetch.
 *
 * The nav link matters more here than it would anywhere else. This page is for
 * the night the server has been rebuilt and somebody is staring at an empty
 * admin wondering whether five years of the restaurant's website are gone. A
 * page you have to know the URL of does not exist at that moment. It goes in
 * `afterNavLinks` rather than before: it belongs under everything else, quiet,
 * until it is the only thing that matters.
 */

export function BackupsView({ initPageResult, params, searchParams }: AdminViewProps) {
  const { permissions, req, visibleEntities } = initPageResult;
  const adminRoute = req.payload.config.routes.admin || "/admin";

  if (!req.user || !permissions?.canAccessAdmin) {
    const loginRoute = req.payload.config.admin.routes.login || "/login";
    redirect(
      `${adminRoute}${loginRoute}?redirect=${encodeURIComponent(`${adminRoute}/backups`)}`,
    );
  }

  return (
    <DefaultTemplate
      className="backups-view"
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user}
      // Copied field by field rather than passed straight through, for the same
      // reason @payloadcms/next does it: React 19 freezes the object and
      // handing the template the original one throws on assignment.
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <SetStepNav nav={[{ label: "Backups" }]} />
      <Gutter>
        <BackupPanel />
      </Gutter>
    </DefaultTemplate>
  );
}

export function BackupsNavLink({ payload }: Partial<ServerProps>) {
  const adminRoute = payload?.config?.routes?.admin || "/admin";
  return (
    <a className="nav__link" href={`${adminRoute}/backups`} id="nav-backups">
      <span className="nav__link-label">Backups</span>
    </a>
  );
}
