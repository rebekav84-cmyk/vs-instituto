import { useState, type FormEvent } from 'react';
import { getGetStaffMeQueryKey, useChangePassword, useGetStaffMe } from '@workspace/api-client-react';
import { Check, LoaderCircle } from 'lucide-react';
import { AppHeader, AuthNotice, ErrorBlock, LoadingBlock } from '@/components/brand';
import { toast } from '@/hooks/use-toast';
import { apiErrorMessage, apiErrorStatus } from '@/lib/format';

const inputClass =
  'mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-base font-normal normal-case tracking-normal text-foreground outline-none focus:border-accent sm:text-sm';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground';

export default function AccountPage() {
  const me = useGetStaffMe({ query: { queryKey: getGetStaffMeQueryKey(), retry: false } });
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const valid = current.length > 0 && next.length >= 8 && next === confirm;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    change.mutate(
      { data: { currentPassword: current, newPassword: next } },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          toast({ title: 'Senha alterada', description: 'Outros aparelhos conectados precisarão entrar de novo.' });
        },
      },
    );
  };

  let body;
  if (me.isLoading) body = <LoadingBlock label="Abrindo" />;
  else if (apiErrorStatus(me.error) === 401) body = <AuthNotice title="Entre para ver sua conta" />;
  else if (me.isError) body = <ErrorBlock onRetry={() => me.refetch()} />;
  else if (me.data)
    body = (
      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent">seus dados</p>
          <p className="mt-3 text-lg font-semibold">{me.data.displayName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{me.data.email}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            {me.data.role === 'admin' ? 'Acesso de administração' : 'Acesso de profissional'}. Para mudar nome ou e-mail, fale com a administração.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6" data-testid="form-change-password">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent">segurança</p>
          <h2 className="display text-3xl">Trocar senha</h2>
          <label className={labelClass}>
            Senha atual
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={inputClass} data-testid="input-current-password" />
          </label>
          <label className={labelClass}>
            Nova senha
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className={inputClass} data-testid="input-new-password" />
            {next && next.length < 8 && <span className="mt-1 block text-[11px] normal-case tracking-normal text-destructive">Mínimo de 8 caracteres.</span>}
          </label>
          <label className={labelClass}>
            Repita a nova senha
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={inputClass} data-testid="input-confirm-password" />
            {confirm && confirm !== next && <span className="mt-1 block text-[11px] normal-case tracking-normal text-destructive">As senhas não são iguais.</span>}
          </label>
          {change.isError && (
            <p className="text-sm text-destructive" role="alert">
              {apiErrorMessage(change.error, 'Não foi possível trocar a senha.')}
            </p>
          )}
          <button
            type="submit"
            disabled={!valid || change.isPending}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
            data-testid="button-change-password"
          >
            {change.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar nova senha
          </button>
        </form>
      </div>
    );

  return (
    <div className="min-h-[100dvh] bg-background">
      <AppHeader staff />
      <main className="mx-auto max-w-5xl px-5 py-8 lg:py-12">
        <div className="border-b border-border pb-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-accent">área da equipe</p>
          <h1 className="display mt-2 text-5xl">Minha conta</h1>
        </div>
        <div className="mt-8">{body}</div>
      </main>
    </div>
  );
}
