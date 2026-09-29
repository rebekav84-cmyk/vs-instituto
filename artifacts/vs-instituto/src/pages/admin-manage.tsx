import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSettingsQueryKey,
  getGetStaffMeQueryKey,
  getListAccountsQueryKey,
  getListAdminProfessionalsQueryKey,
  getListAdminServicesQueryKey,
  getListProfessionalsQueryKey,
  getListServicesQueryKey,
  useCreateAccount,
  useCreateProfessional,
  useCreateService,
  useGetStaffMe,
  useListAccounts,
  useListAdminProfessionals,
  useListAdminServices,
  useUpdateAccount,
  useUpdateProfessional,
  useUpdateService,
  useUpdateSettings,
} from '@workspace/api-client-react';
import type { AdminProfessional, AdminService, StaffAccount } from '@workspace/api-client-react';
import { Check, KeyRound, LoaderCircle, Pencil, Plus, Shuffle, UserRound } from 'lucide-react';
import { Redirect } from 'wouter';
import { AppHeader, AuthNotice, ErrorBlock, LoadingBlock, useSalon } from '@/components/brand';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { apiErrorMessage, apiErrorStatus, duration, formatPhoneInput, money, onlyDigits } from '@/lib/format';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const inputClass =
  'mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-base font-normal normal-case tracking-normal text-foreground outline-none focus:border-accent sm:text-sm';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground';
const primaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45';
const secondaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:border-accent';

const showError = (error: unknown) =>
  toast({ variant: 'destructive', title: 'Não foi possível salvar', description: apiErrorMessage(error, 'Tente novamente.') });

/** Moldura das páginas de cadastro: só a administração entra. */
function AdminFrame({ eyebrow, title, subtitle, action, children }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  const me = useGetStaffMe({ query: { queryKey: getGetStaffMeQueryKey(), retry: false } });
  let body: ReactNode = children;
  if (me.isLoading) body = <LoadingBlock label="Abrindo" />;
  else if (apiErrorStatus(me.error) === 401) body = <AuthNotice title="Acesso da administração" />;
  else if (me.isError) body = <ErrorBlock label={apiErrorMessage(me.error, 'Não foi possível verificar seu acesso.')} onRetry={() => me.refetch()} />;
  else if (me.data?.role !== 'admin') return <Redirect to="/equipe" />;
  return (
    <div className="min-h-[100dvh] bg-background">
      <AppHeader staff />
      <main className="mx-auto max-w-5xl px-5 py-8 lg:py-12">
        <div className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
            <h1 className="display mt-2 text-5xl">{title}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {me.data?.role === 'admin' && action}
        </div>
        <div className="mt-8">{body}</div>
      </main>
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? 'bg-emerald-600/10 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-sm font-semibold">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-border'}`}
      >
        <span className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-card transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------

function ServiceDialog({ service, open, onClose }: { service: AdminService | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateService();
  const update = useUpdateService();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(service?.name ?? '');
    setPrice(service ? service.price.toFixed(2).replace('.', ',') : '');
    setMinutes(service?.durationMinutes ?? 60);
    setActive(service?.active ?? true);
  }, [open, service]);

  const priceValue = Number(price.replace(/\./g, '').replace(',', '.'));
  const valid = name.trim().length >= 2 && price.trim() !== '' && Number.isFinite(priceValue) && priceValue >= 0;
  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const data = { name: name.trim(), price: priceValue, durationMinutes: minutes, active };
    const done = () => {
      qc.invalidateQueries({ queryKey: getListAdminServicesQueryKey() });
      qc.invalidateQueries({ queryKey: getListServicesQueryKey() });
      toast({ title: service ? 'Serviço atualizado' : 'Serviço criado' });
      onClose();
    };
    if (service) update.mutate({ id: service.id, data }, { onSuccess: done, onError: showError });
    else create.mutate({ data }, { onSuccess: done, onError: showError });
  };

  const durations = Array.from({ length: 32 }, (_, index) => (index + 1) * 15);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{service ? 'Editar serviço' : 'Novo serviço'}</DialogTitle>
            <DialogDescription>Aparece para as clientes na primeira etapa do agendamento.</DialogDescription>
          </DialogHeader>
          <label className={labelClass}>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Corte feminino" className={inputClass} data-testid="input-service-name" autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Preço (R$)
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0,00" className={inputClass} data-testid="input-service-price" />
            </label>
            <label className={labelClass}>
              Duração
              <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inputClass} data-testid="select-service-duration">
                {durations.map((value) => (
                  <option key={value} value={value}>
                    {duration(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Toggle checked={active} onChange={setActive} label="Disponível para agendamento" />
          <DialogFooter>
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancelar
            </button>
            <button type="submit" disabled={!valid || busy} className={primaryButton} data-testid="button-save-service">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminServices() {
  const services = useListAdminServices({ query: { queryKey: getListAdminServicesQueryKey(), retry: false } });
  const [editing, setEditing] = useState<AdminService | null>(null);
  const [open, setOpen] = useState(false);
  const openDialog = (service: AdminService | null) => {
    setEditing(service);
    setOpen(true);
  };
  return (
    <AdminFrame
      eyebrow="cadastro"
      title="Serviços"
      subtitle="Nome, preço e duração de cada serviço. Serviços inativos somem do site, mas continuam no histórico."
      action={
        <button onClick={() => openDialog(null)} className={primaryButton} data-testid="button-new-service">
          <Plus className="h-4 w-4" /> Novo serviço
        </button>
      }
    >
      {services.isLoading && <LoadingBlock label="Carregando serviços" />}
      {services.isError && <ErrorBlock onRetry={() => services.refetch()} />}
      {services.data?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum serviço cadastrado ainda. Clique em <strong>Novo serviço</strong> para começar.
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {services.data?.map((service) => (
          <div key={service.id} className={`flex items-center gap-4 border-b border-border p-4 last:border-0 ${service.active ? '' : 'opacity-60'}`} data-testid={`row-service-${service.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{service.name}</p>
                <ActiveBadge active={service.active} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {duration(service.durationMinutes)} · {money(service.price)}
              </p>
            </div>
            <button onClick={() => openDialog(service)} className="rounded-lg p-2 hover:bg-muted" aria-label={`Editar ${service.name}`} data-testid={`button-edit-service-${service.id}`}>
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <ServiceDialog service={editing} open={open} onClose={() => setOpen(false)} />
    </AdminFrame>
  );
}

// ---------------------------------------------------------------------------
// Equipe: profissionais e acessos
// ---------------------------------------------------------------------------

function ProfessionalDialog({ professional, open, onClose }: { professional: AdminProfessional | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateProfessional();
  const update = useUpdateProfessional();
  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [startsAt, setStartsAt] = useState('09:00');
  const [endsAt, setEndsAt] = useState('18:00');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(professional?.name ?? '');
    setInitials(professional?.initials ?? '');
    setStartsAt(professional?.startsAt ?? '09:00');
    setEndsAt(professional?.endsAt ?? '18:00');
    setWeekdays(professional?.weekdays ?? [1, 2, 3, 4, 5, 6]);
    setActive(professional?.active ?? true);
  }, [open, professional]);

  const valid = name.trim().length >= 2 && weekdays.length > 0 && startsAt < endsAt;
  const busy = create.isPending || update.isPending;
  const toggleDay = (day: number) =>
    setWeekdays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const data = { name: name.trim(), initials: initials.trim() || undefined, startsAt, endsAt, weekdays, active };
    const done = () => {
      qc.invalidateQueries({ queryKey: getListAdminProfessionalsQueryKey() });
      qc.invalidateQueries({ queryKey: getListProfessionalsQueryKey() });
      toast({ title: professional ? 'Profissional atualizada' : 'Profissional cadastrada' });
      onClose();
    };
    if (professional) update.mutate({ id: professional.id, data }, { onSuccess: done, onError: showError });
    else create.mutate({ data }, { onSuccess: done, onError: showError });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{professional ? 'Editar profissional' : 'Nova profissional'}</DialogTitle>
            <DialogDescription>Define quem aparece para as clientes e em quais dias e horários atende.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <label className={labelClass}>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} data-testid="input-professional-name" autoFocus />
            </label>
            <label className={labelClass}>
              Iniciais
              <input value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 3))} placeholder="auto" className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Começa às
              <input type="time" step={1800} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} data-testid="input-professional-start" />
            </label>
            <label className={labelClass}>
              Termina às
              <input type="time" step={1800} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} data-testid="input-professional-end" />
            </label>
          </div>
          <div>
            <p className={labelClass}>Dias de atendimento</p>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((label, day) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={weekdays.includes(day)}
                  className={`h-10 rounded-lg border text-xs font-semibold ${weekdays.includes(day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-accent'}`}
                  data-testid={`button-weekday-${day}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Toggle checked={active} onChange={setActive} label="Aparece para agendamento" />
          {startsAt >= endsAt && <p className="text-xs text-destructive">O início precisa ser antes do fim.</p>}
          <DialogFooter>
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancelar
            </button>
            <button type="submit" disabled={!valid || busy} className={primaryButton} data-testid="button-save-professional">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const randomPassword = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
};

function AccountDialog({
  account,
  open,
  onClose,
  professionals,
}: {
  account: StaffAccount | null;
  open: boolean;
  onClose: () => void;
  professionals: AdminProfessional[];
}) {
  const qc = useQueryClient();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'professional' | 'admin'>('professional');
  const [professionalId, setProfessionalId] = useState<number | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setEmail(account?.email ?? '');
    setPassword(account ? '' : randomPassword());
    setRole(account?.role ?? 'professional');
    setProfessionalId(account?.professionalId ?? null);
    setActive(account?.active ?? true);
  }, [open, account]);

  const passwordOk = account ? password === '' || password.length >= 8 : password.length >= 8;
  const valid =
    name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && passwordOk && (role === 'admin' || professionalId !== null);
  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const done = () => {
      qc.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      toast({
        title: account ? 'Acesso atualizado' : 'Acesso criado',
        description: password ? `Envie para a pessoa: e-mail ${email.trim()} e senha ${password}` : undefined,
      });
      onClose();
    };
    const base = { name: name.trim(), email: email.trim(), role, professionalId: role === 'admin' ? null : professionalId };
    if (account) update.mutate({ id: account.id, data: { ...base, active, ...(password ? { password } : {}) } }, { onSuccess: done, onError: showError });
    else create.mutate({ data: { ...base, password } }, { onSuccess: done, onError: showError });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{account ? 'Editar acesso' : 'Novo acesso'}</DialogTitle>
            <DialogDescription>E-mail e senha que a pessoa usa em “Área da equipe”.</DialogDescription>
          </DialogHeader>
          <label className={labelClass}>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} data-testid="input-account-name" autoFocus />
          </label>
          <label className={labelClass}>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} data-testid="input-account-email" />
          </label>
          <label className={labelClass}>
            {account ? 'Nova senha (deixe vazio para manter)' : 'Senha inicial'}
            <span className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} font-mono`} data-testid="input-account-password" />
              <button type="button" onClick={() => setPassword(randomPassword())} className="mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border hover:border-accent" aria-label="Gerar senha">
                <Shuffle className="h-4 w-4" />
              </button>
            </span>
            {!passwordOk && <span className="mt-1 block text-[11px] normal-case tracking-normal text-destructive">Mínimo de 8 caracteres.</span>}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['professional', 'admin'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                aria-pressed={role === value}
                className={`h-11 rounded-xl border text-sm font-semibold ${role === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-accent'}`}
                data-testid={`button-role-${value}`}
              >
                {value === 'admin' ? 'Administração' : 'Profissional'}
              </button>
            ))}
          </div>
          {role === 'professional' && (
            <label className={labelClass}>
              Agenda de qual profissional?
              <select
                value={professionalId ?? ''}
                onChange={(e) => setProfessionalId(e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
                data-testid="select-account-professional"
              >
                <option value="">Escolha…</option>
                {professionals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.active ? '' : ' (inativa)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {account && <Toggle checked={active} onChange={setActive} label="Acesso ativo" />}
          <DialogFooter>
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancelar
            </button>
            <button type="submit" disabled={!valid || busy} className={primaryButton} data-testid="button-save-account">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminTeam() {
  const professionals = useListAdminProfessionals({ query: { queryKey: getListAdminProfessionalsQueryKey(), retry: false } });
  const accounts = useListAccounts({ query: { queryKey: getListAccountsQueryKey(), retry: false } });
  const [professional, setProfessional] = useState<AdminProfessional | null>(null);
  const [professionalOpen, setProfessionalOpen] = useState(false);
  const [account, setAccount] = useState<StaffAccount | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const team = professionals.data ?? [];
  const nameOf = (id: number | null) => team.find((item) => item.id === id)?.name;

  return (
    <AdminFrame
      eyebrow="cadastro"
      title="Equipe"
      subtitle="Profissionais que atendem e os acessos (e-mail e senha) de quem usa a área da equipe."
      action={
        <button
          onClick={() => {
            setProfessional(null);
            setProfessionalOpen(true);
          }}
          className={primaryButton}
          data-testid="button-new-professional"
        >
          <Plus className="h-4 w-4" /> Nova profissional
        </button>
      }
    >
      <section>
        <h2 className="display text-3xl">Profissionais</h2>
        <div className="mt-4">
          {professionals.isLoading && <LoadingBlock label="Carregando equipe" />}
          {professionals.isError && <ErrorBlock onRetry={() => professionals.refetch()} />}
          {professionals.data?.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma profissional cadastrada. Cadastre pelo menos uma para o site aceitar agendamentos.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {team.map((item) => (
              <div key={item.id} className={`flex gap-4 rounded-2xl border border-border bg-card p-4 ${item.active ? '' : 'opacity-60'}`} data-testid={`row-professional-${item.id}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{item.initials}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{item.name}</p>
                    <ActiveBadge active={item.active} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.startsAt} às {item.endsAt}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.weekdays.map((day) => WEEKDAYS[day]).join(' · ')}</p>
                </div>
                <button
                  onClick={() => {
                    setProfessional(item);
                    setProfessionalOpen(true);
                  }}
                  className="self-start rounded-lg p-2 hover:bg-muted"
                  aria-label={`Editar ${item.name}`}
                  data-testid={`button-edit-professional-${item.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-3xl">Acessos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cada profissional pode ter seu login para ver só a própria agenda.</p>
          </div>
          <button
            onClick={() => {
              setAccount(null);
              setAccountOpen(true);
            }}
            className={secondaryButton}
            data-testid="button-new-account"
          >
            <KeyRound className="h-4 w-4 text-accent" /> Novo acesso
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          {accounts.isLoading && <div className="p-4"><LoadingBlock label="Carregando acessos" /></div>}
          {accounts.isError && <div className="p-4"><ErrorBlock onRetry={() => accounts.refetch()} /></div>}
          {accounts.data?.map((item) => (
            <div key={item.id} className={`flex items-center gap-4 border-b border-border p-4 last:border-0 ${item.active ? '' : 'opacity-60'}`} data-testid={`row-account-${item.id}`}>
              <UserRound className="h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.name}</p>
                  <ActiveBadge active={item.active} />
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{item.email}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.role === 'admin' ? 'Administração' : `Profissional · ${nameOf(item.professionalId) ?? '—'}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setAccount(item);
                  setAccountOpen(true);
                }}
                className="rounded-lg p-2 hover:bg-muted"
                aria-label={`Editar acesso de ${item.name}`}
                data-testid={`button-edit-account-${item.id}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <ProfessionalDialog professional={professional} open={professionalOpen} onClose={() => setProfessionalOpen(false)} />
      <AccountDialog account={account} open={accountOpen} onClose={() => setAccountOpen(false)} professionals={team} />
    </AdminFrame>
  );
}

// ---------------------------------------------------------------------------
// Informações do salão
// ---------------------------------------------------------------------------

export function AdminSalon() {
  const qc = useQueryClient();
  const salon = useSalon();
  const save = useUpdateSettings();
  const [form, setForm] = useState(salon);
  const [loaded, setLoaded] = useState(false);

  // Preenche o formulário quando as informações chegam do servidor.
  const cached = qc.getQueryData(getGetSettingsQueryKey());
  useEffect(() => {
    if (cached && !loaded) {
      setForm({ ...salon, whatsapp: formatPhoneInput(salon.whatsapp.replace(/^55(?=\d{10,11}$)/, '')) });
      setLoaded(true);
    }
  }, [cached, loaded, salon]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const whatsappDigits = onlyDigits(form.whatsapp);
  const valid = form.name.trim().length >= 2 && (whatsappDigits === '' || whatsappDigits.length >= 10) && form.salonSharePercent >= 0 && form.salonSharePercent <= 100;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    save.mutate(
      { data: { ...form, whatsapp: whatsappDigits } },
      {
        onSuccess: (data) => {
          qc.setQueryData(getGetSettingsQueryKey(), data);
          toast({ title: 'Informações salvas' });
        },
        onError: showError,
      },
    );
  };

  return (
    <AdminFrame eyebrow="configuração" title="Salão" subtitle="Informações exibidas no rodapé do site e na confirmação do agendamento.">
      <form onSubmit={submit} className="max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6">
        <label className={labelClass}>
          Nome do salão
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} className={inputClass} data-testid="input-salon-name" />
        </label>
        <label className={labelClass}>
          WhatsApp do salão
          <input value={form.whatsapp} onChange={(e) => set('whatsapp', formatPhoneInput(e.target.value))} inputMode="tel" placeholder="(27) 99999-9999" className={inputClass} data-testid="input-salon-whatsapp" />
        </label>
        <label className={labelClass}>
          Endereço
          <input value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={200} placeholder="Rua, número, bairro, cidade" className={inputClass} data-testid="input-salon-address" />
        </label>
        <label className={labelClass}>
          Instagram
          <input value={form.instagram} onChange={(e) => set('instagram', e.target.value.replace(/\s/g, ''))} maxLength={60} placeholder="@seuperfil" className={inputClass} data-testid="input-salon-instagram" />
        </label>
        <label className={labelClass}>
          Texto de apresentação (opcional)
          <textarea
            value={form.about}
            onChange={(e) => set('about', e.target.value)}
            maxLength={600}
            rows={3}
            placeholder="Aparece no início do site, abaixo do título."
            className={`${inputClass} h-auto py-2.5`}
            data-testid="input-salon-about"
          />
        </label>
        <label className={labelClass}>
          Participação do salão nos atendimentos (%)
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={form.salonSharePercent}
            onChange={(e) => set('salonSharePercent', Number(e.target.value))}
            className={inputClass}
            data-testid="input-salon-share"
          />
          <span className="mt-1 block text-[11px] normal-case tracking-normal">
            O restante ({100 - form.salonSharePercent}%) é o repasse da profissional. Vale para os próximos atendimentos concluídos.
          </span>
        </label>
        <button type="submit" disabled={!valid || save.isPending} className={primaryButton} data-testid="button-save-salon">
          {save.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar informações
        </button>
      </form>
    </AdminFrame>
  );
}
