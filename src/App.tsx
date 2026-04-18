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
import NotFound from "./pages/NotFound";

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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
