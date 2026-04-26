import { NavLink, useLocation } from "react-router-dom";
import {
  FileCheck,
  History as HistoryIcon,
  TrendingUp,
  BarChart3,
  FolderOpen,
  Users,
  BookOpen,
  Edit3,
  ScanLine,
  LayoutDashboard,
} from "lucide-react";

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
  useSidebar,
} from "@/components/ui/sidebar";
import FlemingLogo from "@/components/FlemingLogo";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match exatamente. Se false, considera prefix match (ex.: /omr cobre /omr/upload/:id). */
  end?: boolean;
  /** Padrões adicionais que também devem marcar o item como ativo. */
  matchPrefixes?: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "Início",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: "Correção",
    items: [
      { title: "Corrigir Prova", url: "/correct", icon: FileCheck, end: true },
      { title: "Escanear Gabarito", url: "/omr", icon: ScanLine, matchPrefixes: ["/omr"] },
      { title: "Editar Respostas", url: "/students/edit", icon: Edit3, end: true },
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
      { title: "Disciplinas", url: "/disciplines", icon: BookOpen, end: true },
    ],
  },
];

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.url;
  if (item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return pathname === item.url || pathname.startsWith(item.url + "/");
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          {collapsed ? (
            <FlemingLogo size="sm" />
          ) : (
            <FlemingLogo size="sm" />
          )}
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight">Sistema Fleming</span>
          )}
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
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <NavLink to={item.url} end={item.end}>
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

export default AppSidebar;