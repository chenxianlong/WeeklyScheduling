import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./lib/api";
import type { AppConfig, CurrentUser } from "./lib/types";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicationWorkspacePage } from "./pages/PublicationWorkspacePage";
import { PublicationsPage } from "./pages/PublicationsPage";
import { ReviewQueuePage } from "./pages/ReviewQueuePage";
import { SubmissionDetailPage } from "./pages/SubmissionDetailPage";
import { SubmissionEditorPage } from "./pages/SubmissionEditorPage";
import { SubmissionListPage } from "./pages/SubmissionListPage";
import { SharedSubmissionsPage } from "./pages/SharedSubmissionsPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";

type Session = { user: CurrentUser | null; config: AppConfig };

export default function App() {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<Session>("/auth/me"),
    retry: false,
  });
  if (session.isLoading || !session.data) return <Spinner />;
  if (!session.data.user) {
    return (
      <LoginPage
        config={session.data.config}
        onLoggedIn={() => queryClient.invalidateQueries({ queryKey: ["session"] })}
      />
    );
  }
  const user = session.data.user;
  const config = session.data.config;
  const isAdmin = user.role === "admin" || user.role === "system_admin";
  return (
    <Routes>
      <Route
        element={
          <AppShell
            user={user}
            config={config}
            onLogout={() => queryClient.setQueryData(["session"], { user: null, config })}
          />
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="submissions" element={<SubmissionListPage />} />
        <Route path="submissions/shared" element={<SharedSubmissionsPage config={config} />} />
        <Route path="submissions/new" element={<SubmissionEditorPage config={config} user={user} />} />
        <Route path="submissions/:id" element={<SubmissionDetailPage user={user} />} />
        <Route
          path="submissions/:id/edit"
          element={<SubmissionEditorPage config={config} user={user} />}
        />
        <Route path="publications" element={<PublicationsPage user={user} />} />
        <Route
          path="admin/reviews"
          element={isAdmin ? <ReviewQueuePage /> : <Navigate to="/" replace />}
        />
        <Route
          path="admin/publication"
          element={isAdmin ? <PublicationWorkspacePage config={config} /> : <Navigate to="/" replace />}
        />
        <Route
          path="admin/publications/:id/edit"
          element={isAdmin ? <PublicationWorkspacePage config={config} /> : <Navigate to="/" replace />}
        />
        <Route
          path="admin/settings"
          element={
            isAdmin ? (
              <AdminSettingsPage
                currentUser={user}
                emailAllowedDomain={config.emailAllowedDomain}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
