import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";

/**
 * Layout principal autenticado: sidebar fixa + área de conteúdo.
 * As páginas filhas mantêm seus próprios headers internos por enquanto
 * (refatoração progressiva, sem alterar lógica).
 */
const AppLayout = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Barra mínima global apenas para garantir que o trigger esteja sempre visível em mobile */}
          <div className="md:hidden h-12 flex items-center border-b bg-card/50 backdrop-blur-sm sticky top-0 z-20 px-2">
            <SidebarTrigger />
          </div>

          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;