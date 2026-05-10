import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Templates from "./pages/Templates";
import TemplateEdit from "./pages/TemplateEdit";
import Correct from "./pages/Correct";
import History from "./pages/History";
import Reports from "./pages/Reports";
import Boletins from "./pages/Boletins";
import BoletimAcafe from "./pages/BoletimAcafe";
import Disciplines from "./pages/Disciplines";
import StudentEdit from "./pages/StudentEdit";
import StudentPerformance from "./pages/StudentPerformance";
import Students from "./pages/Students";
import Classes from "./pages/Classes";
import OmrHub from "./pages/OmrHub";
import OmrEnroll from "./pages/OmrEnroll";
import OmrGenerate from "./pages/OmrGenerate";
import OmrUpload from "./pages/OmrUpload";
import OmrReview from "./pages/OmrReview";
import OmrDone from "./pages/OmrDone";
import CorrectionEdit from "./pages/CorrectionEdit";
import NotFound from "./pages/NotFound";
import EssayScores from "./pages/EssayScores";
import AppLayout from "./components/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/templates/:id" element={<TemplateEdit />} />
            <Route path="/correct" element={<Correct />} />
            <Route path="/history" element={<History />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/boletins" element={<Boletins />} />
            <Route path="/boletins/acafe" element={<BoletimAcafe />} />
            <Route path="/disciplines" element={<Disciplines />} />
            <Route path="/students/edit" element={<StudentEdit />} />
            <Route path="/students/performance" element={<StudentPerformance />} />
            <Route path="/students" element={<Students />} />
            <Route path="/classes" element={<Classes />} />
          <Route path="/essay-scores" element={<EssayScores />} />
            <Route path="/omr" element={<OmrHub />} />
            <Route path="/omr/enroll/:templateId" element={<OmrEnroll />} />
            <Route path="/omr/generate/:templateId" element={<OmrGenerate />} />
            <Route path="/omr/upload/:templateId" element={<OmrUpload />} />
            <Route path="/omr/review/:templateId" element={<OmrReview />} />
            <Route path="/omr/done/:templateId" element={<OmrDone />} />
            <Route path="/corrections/:id/edit" element={<CorrectionEdit />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
