import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetStaffMeQueryKey, useGetStaffMe, useLogin } from '@workspace/api-client-react';
import { Eye, EyeOff, LoaderCircle, LogIn } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { BrandMark } from '@/components/brand';
import { apiErrorMessage } from '@/lib/format';

export default function LoginPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const login = useLogin();
  const me = useGetStaffMe({ query: { queryKey: getGetStaffMeQueryKey(), retry: false } });

  // Quem já está logado vai direto para sua área.
  useEffect(() => {
    if (me.data) navigate(me.data.role === 'admin' ? '/admin' : '/equipe', { replace: true });
  }, [me.data, navigate]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    login.mutate(
      { data: { email: email.trim(), password } },
      {
        onSuccess: (user) => {
          qc.setQueryData(getGetStaffMeQueryKey(), user);
          navigate(user.role === 'admin' ? '/admin' : '/equipe', { replace: true });
        },
      },
    );
  };

  const inputClass =
    'mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 text-base font-normal normal-case tracking-normal text-foreground outline-none focus:border-accent sm:text-sm';

  return (
    <div className="grain flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[1.7rem] border border-border bg-card p-7 shadow-md sm:p-9" data-testid="form-login">
        <BrandMark />
        <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.24em] text-accent">área da equipe</p>
        <h1 className="display mt-2 text-4xl">Bem-vinda de volta</h1>
        <div className="mt-6 space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoFocus
              required
              className={inputClass}
              data-testid="input-login-email"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Senha
            <span className="relative block">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className={`${inputClass} pr-12`}
                data-testid="input-login-password"
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                className="absolute right-2 top-1/2 mt-1 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:text-foreground"
                aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
        </div>
        {login.isError && (
          <p className="mt-4 text-sm text-destructive" role="alert" data-testid="status-login-error">
            {apiErrorMessage(login.error, 'Não foi possível entrar agora. Tente novamente.')}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          data-testid="button-login"
        >
          {login.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Entrar
        </button>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Esqueceu a senha? Peça para a administração definir uma nova no painel.
        </p>
      </form>
      <Link href="/" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
        ← Voltar para o site
      </Link>
    </div>
  );
}
