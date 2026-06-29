import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Pencil, Trash2 } from "lucide-react";

const SUPABASE_URL = "https://supabase.flemingfloripa.com.br";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNzQ1OTU3LCJleHAiOjIwOTYxMDU5NTd9.ry3A5SbXnPH0SgIKLRNRv0Rf9IH3GCV17xRZ0D1TwEc";

const PAPEIS = ["diretor", "coordenador", "professor"];

interface Sede { id: string; nome: string; }
interface Usuario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  created_at: string;
  papeis: { papel: string; sedes: { nome: string } | null }[];
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);

  // criar
  const [openCreate, setOpenCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", password: "", sede_id: "", papel: "" });

  // editar
  const [editUser, setEditUser] = useState<Usuario | null>(null);
  const [editForm, setEditForm] = useState({ email: "", password: "", sede_id: "", papel: "" });
  const [editSaving, setEditSaving] = useState(false);

  // excluir
  const [deleteUser, setDeleteUser] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase
        .from("usuarios")
        .select("id, nome, email, ativo, created_at, papeis(papel, sedes(nome))")
        .order("created_at", { ascending: false }),
      supabase.from("sedes").select("id, nome").order("nome"),
    ]);
    setUsuarios((u as any) || []);
    setSedes(s || []);
    setLoading(false);
  }

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || SUPABASE_ANON_KEY;
  }

  async function callManage(body: object) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-manage-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await authToken()}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await authToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      toast({ title: "Usuário criado com sucesso" });
      setForm({ nome: "", email: "", password: "", sede_id: "", papel: "" });
      setOpenCreate(false);
      loadData();
    } catch (err: any) {
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditSaving(true);
    try {
      await callManage({ action: "update", user_id: editUser.id, ...editForm, nome: editUser.nome });
      toast({ title: "Usuário atualizado" });
      setEditUser(null);
      loadData();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      await callManage({ action: "delete", user_id: deleteUser.id });
      toast({ title: "Usuário excluído" });
      setDeleteUser(null);
      loadData();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Criar usuário</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label>Nome completo</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Maria Silva" />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="maria@flemingfloripa.com.br" />
              </div>
              <div className="space-y-1">
                <Label>Senha inicial</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-1">
                <Label>Sede</Label>
                <Select value={form.sede_id} onValueChange={(v) => setForm({ ...form, sede_id: v })} required>
                  <SelectTrigger><SelectValue placeholder="Selecione a sede" /></SelectTrigger>
                  <SelectContent>
                    {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Papel</Label>
                <Select value={form.papel} onValueChange={(v) => setForm({ ...form, papel: v })} required>
                  <SelectTrigger><SelectValue placeholder="Selecione o papel" /></SelectTrigger>
                  <SelectContent>
                    {PAPEIS.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar usuário
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Sede / Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum usuário cadastrado
                </TableCell>
              </TableRow>
            )}
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.papeis?.map((p, i) => (
                      <Badge key={i} variant="secondary">{p.sedes?.nome} · {p.papel}</Badge>
                    ))}
                    {(!u.papeis || u.papeis.length === 0) && (
                      <span className="text-muted-foreground text-sm">Sem papel</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.ativo ? "default" : "destructive"}>
                    {u.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => {
                        setEditUser(u);
                        const primeiro = u.papeis?.[0];
                        const sedeNome = primeiro?.sedes?.nome || "";
                        const sedeEncontrada = sedes.find(s => s.nome === sedeNome);
                        setEditForm({ email: u.email, password: "", sede_id: sedeEncontrada?.id || "", papel: primeiro?.papel || "" });
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setDeleteUser(u)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Dialog editar */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) setEditUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuário — {editUser?.nome}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="novo@email.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Nova senha <span className="text-muted-foreground text-xs">(deixe em branco para não alterar)</span></Label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-1">
              <Label>Sede</Label>
              <Select value={editForm.sede_id} onValueChange={(v) => setEditForm({ ...editForm, sede_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a sede" /></SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Papel</Label>
              <Select value={editForm.papel} onValueChange={(v) => setEditForm({ ...editForm, papel: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o papel" /></SelectTrigger>
                <SelectContent>
                  {PAPEIS.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação excluir */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => { if (!o) setDeleteUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário <strong>{deleteUser?.email}</strong> será removido permanentemente do sistema. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
