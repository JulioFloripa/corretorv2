import { NavLink, useLocation, useParams } from "react-router-dom";
import {
  FileCheck,
  History as HistoryIcon,
  TrendingUp,
  BarChart3,
  FolderOpen,
  Users,
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Printer,
  LogOut,
  UserPlus,
  FileText,
  Upload,
  ClipboardCheck,
  CheckCircle2,
  ScanLine,
  PenLine,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import FlemingLogo from "@/components/FlemingLogo";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match exatamente. Se false, considera prefix match (ex.: /omr cobre /omr/upload/:id). */
  end?: boolean;
  /** PadrÃµes adicionais que tambÃ©m devem marcar o item como ativo. */
  matchPrefixes?: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "Início",
    items: [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Correção",
    items: [
      { title: "Corrigir Prova", url: "/correct", icon: FileCheck, end: true },
      { title: "Leitura de Gabaritos", url: "/omr", icon: ScanLine, matchPrefixes: ["/omr"] },
      { title: "Notas de Redação", url: "/essay-scores", icon: PenLine, end: true },
    ],
  },
  {
    label: "Resultados",
    items: [
      { title: "Histórico", url: "/history", icon: HistoryIcon, end: true },
      { title: "Análise de Desempenho", url: "/students/performance", icon: TrendingUp, end: true },
      { title: "Boletins", url: "/boletins", icon: BarChart3, matchPrefixes: ["/boletins"] },
    ],
  },
  {
    label: "Configurações",
    items: [
      { title: "Provas / Gabaritos", url: "/templates", icon: FolderOpen, matchPrefixes: ["/templates"] },
      { title: "Alunos", url: "/students", icon: Users, end: true },
      { title: "Turmas", url: "/classes", icon: GraduationCap, end: true },
      { title: "Disciplinas", url: "/disciplines", icon: BookOpen, end: true },
    ],
  },
];

/** Etapas do fluxo OMR â exibidas como sub-menu quando o usuário está¡ dentro de /omr/* */
const omrSteps = [
  { title: "Matricular Alunos", segment: "enroll", icon: UserPlus },
  { title: "Gerar Gabaritos", segment: "generate", icon: FileText },
  { title: "Enviar Scans", segment: "upload", icon: Upload },
  { title: "Revisar Leituras", segment: "review", icon: ClipboardCheck },
  { title: "Resumo / Notas", segment: "done", icon: CheckCircle2 },
];

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.url;
  if (item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return pathname === item.url || pathname.startsWith(item.url + "/");
}

/** Extrai o templateId de qualquer rota /omr/<step>/<uuid> */
function extractOmrTemplateId(pathname: string): string | null {
  const match = pathname.match(/^\/omr\/(?:enroll|generate|upload|review|done)\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const pathname = location.pathname;

  const currentTemplateId = extractOmrTemplateId(pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          {collapsed ? <FlemingLogo size="sm" /> : <FlemingLogo size="sm" />}
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Sistema Fleming</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isItemActive(pathname, item);
                  const isOmrParent = item.url === "/omr";

                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <NavLink to={item.url} end={item.end}>
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>

                      {/* Sub-menu de etapas do OMR (sempre visível) */}
                      {isOmrParent && !collapsed && (
                        <SidebarMenuSub>
                          {omrSteps.map((step) => {
                            const stepUrl = currentTemplateId
                              ? `/omr/${step.segment}/${currentTemplateId}`
                              : "/omr";
                            const stepActive = pathname.startsWith(`/omr/${step.segment}/`);
                            const StepIcon = step.icon;

                            return (
                              <SidebarMenuSubItem key={step.segment}>
                                <SidebarMenuSubButton asChild isActive={stepActive}>
                                  <NavLink to={stepUrl}>
                                    <StepIcon className="h-3.5 w-3.5" />
                                    <span>{step.title}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sair"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/auth";
              }}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
