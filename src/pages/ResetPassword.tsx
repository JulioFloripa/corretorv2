import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import FlemingLogo from "@/components/FlemingLogo";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase processa o token automaticamente via hash. Verificamos se há sessão de recovery.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirm = formData.get("confirm") as string;

    if (password !== confirm) {
      toast({ variant: "destructive", title: "As senhas não coincidem" });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ variant: "destructive", title: "Erro ao redefinir senha", description: error.message });
    } else {
      toast({ title: "Senha redefinida com sucesso!" });
      await supabase.auth.signOut();
      navigate("/auth");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md p-4">
        <div className="flex flex-col items-center mb-6">
          <FlemingLogo size="lg" />
          <p className="text-muted-foreground text-center mt-2">Redefinir senha</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Nova senha</CardTitle>
            <CardDescription>
              {ready ? "Defina uma nova senha para sua conta." : "Validando link de redefinição..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input id="password" name="password" type="password" required minLength={6} disabled={!ready} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar senha</Label>
                <Input id="confirm" name="confirm" type="password" required minLength={6} disabled={!ready} />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {loading ? "Salvando..." : "Redefinir senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;