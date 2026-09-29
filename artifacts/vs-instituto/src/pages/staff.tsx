import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminSummaryQueryKey,
  getGetAvailabilityQueryKey,
  getGetScheduleSettingsQueryKey,
  getGetStaffAgendaQueryKey,
  getGetStaffMeQueryKey,
  useGetAdminSummary,
  useGetScheduleSettings,
  useGetStaffAgenda,
  useGetStaffMe,
  useListProfessionals,
  useUpdateAppointmentStatus,
  useUpdateSchedule,
  useUpdateSlot,
} from '@workspace/api-client-react';
import type { AdminSummary, Appointment, AppointmentStatus, Professional } from '@workspace/api-client-react';
import { CalendarDays, Check, CreditCard, LoaderCircle, Lock, MessageCircle, MoreHorizontal, Scissors, Settings2, Sparkles, X } from 'lucide-react';
import { Redirect } from 'wouter';
import {
  AppHeader,
  AuthNotice,
  DayNavigator,
  ErrorBlock,
  LoadingBlock,
  Metric,
  useSalon,
} from '@/components/brand';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { apiErrorMessage, apiErrorStatus, displayDate, duration, firstName, formatCode, money, salonToday, shortDate, whatsappLink } from '@/lib/format';

const statusLabels: Record<string, string> = {
  scheduled: 'Agendado',
  arrived: 'Chegou',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Faltou',
};

const statusTone: Record<string, string> = {
  scheduled: 'bg-accent/15 text-foreground',
  arrived: 'bg-blue-500/10 text-blue-800',
  completed: 'bg-emerald-600/10 text-emerald-800',
  cancelled: 'bg-muted text-muted-foreground',
  no_show: 'bg-destructive/10 text-destructive',
};

/** Keeps the selected dashboard date in the URL (?data=YYYY-MM-DD) so a reload keeps it. */
function useDashboardDate() {
  const [date, setDateState] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('data');
    return fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) ? fromUrl : salonToday();
  });
  const setDate = (value: string) => {
    setDateState(value);
    const url = new URL(window.location.href);
    if (value === salonToday()) url.searchParams.delete('data');
    else url.searchParams.set('data', value);
    window.history.replaceState(null, '', url);
  };
  return [date, setDate] as const;
}

function useStaffMe() {
  const me = useGetStaffMe({ query: { queryKey: getGetStaffMeQueryKey(), retry: false } });
  const signedOut = apiErrorStatus(me.error) === 401;
  return { me, loading: me.isLoading, signedOut, authFailed: false };
}

function StaffShell({
  children,
  eyebrow = 'operação VS',
  title,
  date,
  setDate,
}: {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  date: string;
  setDate: (value: string) => void;
}) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <AppHeader staff />
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-10 lg:py-12">
        <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
            <h1 className="display mt-2 text-5xl">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{displayDate(date)}</p>
          </div>
          <DayNavigator date={date} setDate={setDate} />
        </div>
        {children}
      </main>
    </div>
  );
}

function AccessDenied({ error, authFailed = false }: { error: unknown; authFailed?: boolean }) {
  if (authFailed)
    return (
      <div className="mt-8">
        <ErrorBlock label="Não foi possível carregar o login da equipe. Verifique a conexão e recarregue a página." onRetry={() => window.location.reload()} />
      </div>
    );
  const status = apiErrorStatus(error);
  if (status === 401) return <AuthNotice title="Entre para ver sua agenda" />;
  if (status === 403)
    return (
      <AuthNotice
        title="Acesso não liberado"
        message={apiErrorMessage(error, 'Esta conta não tem acesso à equipe. Peça para a administração vincular seu cadastro.')}
      />
    );
  return <ErrorBlock label={apiErrorMessage(error, 'Não foi possível verificar seu acesso.')} onRetry={() => window.location.reload()} />;
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

function CompleteDialog({
  appointment,
  onClose,
  onConfirm,
  busy,
}: {
  appointment: Appointment | null;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState('');
  const share = useSalon().salonSharePercent / 100;
  useEffect(() => {
    if (appointment) setValue(String(appointment.expectedAmount.toFixed(2)).replace('.', ','));
  }, [appointment]);
  const amount = Number(value.replace(/\./g, '').replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(amount) && amount >= 0;
  return (
    <Dialog open={Boolean(appointment)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Concluir atendimento</DialogTitle>
          <DialogDescription>
            {appointment && `${appointment.clientName} · ${appointment.service.name}. Informe o valor recebido.`}
          </DialogDescription>
        </DialogHeader>
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Valor recebido (R$)
          <input
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            autoFocus
            className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 text-base tracking-normal text-foreground outline-none focus:border-accent"
            data-testid="input-received-amount"
          />
        </label>
        {valid && (
          <p className="text-xs text-muted-foreground">
            Instituto {money(amount * share)} · Profissional {money(amount * (1 - share))}
          </p>
        )}
        <DialogFooter>
          <button onClick={onClose} className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">
            Voltar
          </button>
          <button
            onClick={() => valid && onConfirm(amount)}
            disabled={!valid || busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
            data-testid="button-confirm-complete"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Concluir
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgendaList({
  appointments,
  date,
  showProfessional = false,
  onChanged,
  isLoading,
  isError,
  onRetry,
}: {
  appointments: Appointment[];
  date: string;
  showProfessional?: boolean;
  onChanged: () => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const statusMutation = useUpdateAppointmentStatus();
  const [completing, setCompleting] = useState<Appointment | null>(null);
  const active = appointments.filter((item) => item.status !== 'cancelled');
  const cancelled = appointments.filter((item) => item.status === 'cancelled');
  const [showCancelled, setShowCancelled] = useState(false);

  const changeStatus = (appointment: Appointment, status: AppointmentStatus, receivedAmount?: number) =>
    statusMutation.mutate(
      { id: appointment.id, data: { status, ...(receivedAmount != null ? { receivedAmount } : {}) } },
      {
        onSuccess: () => {
          setCompleting(null);
          onChanged();
          toast({ title: `${firstName(appointment.clientName)}: ${statusLabels[status].toLowerCase()}` });
        },
        onError: (error) =>
          toast({ variant: 'destructive', title: 'Não foi possível atualizar', description: apiErrorMessage(error, 'Tente novamente.') }),
      },
    );

  const salonName = useSalon().name;
  const row = (item: Appointment) => {
    const wa = whatsappLink(
      item.whatsapp,
      `Olá, ${firstName(item.clientName)}! Aqui é do ${salonName}, sobre seu horário de ${item.service.name} em ${shortDate(item.date)} às ${item.time}.`,
    );
    return (
      <div
        key={item.id}
        className={`flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:items-center ${item.status === 'cancelled' ? 'opacity-60' : ''}`}
        data-testid={`row-agenda-${item.id}`}
      >
        <div className="w-14 shrink-0 text-center">
          <p className="font-mono text-sm font-bold">{item.time}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{duration(item.service.durationMinutes)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{item.clientName}</p>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusTone[item.status]}`} data-testid={`status-agenda-${item.id}`}>
              {statusLabels[item.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.service.name} · {money(item.status === 'completed' ? item.receivedAmount : item.expectedAmount)}
            {showProfessional && <> · {item.professional.name}</>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline" data-testid={`link-whatsapp-${item.id}`}>
                <MessageCircle className="h-3 w-3" /> {item.whatsapp}
              </a>
            ) : (
              <span>{item.whatsapp}</span>
            )}
            <span className="font-mono">{formatCode(item.code)}</span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="self-start rounded-lg p-2 hover:bg-muted sm:self-center" aria-label="Ações do atendimento" data-testid={`button-agenda-menu-${item.id}`}>
              {statusMutation.isPending && statusMutation.variables?.id === item.id ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <MoreHorizontal className="h-5 w-5" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">Marcar como</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(['scheduled', 'arrived', 'completed', 'no_show', 'cancelled'] as AppointmentStatus[])
              .filter((status) => status !== item.status)
              .map((status) => (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => (status === 'completed' ? setCompleting(item) : changeStatus(item, status))}
                  className={status === 'cancelled' ? 'text-destructive' : undefined}
                  data-testid={`button-status-${item.id}-${status}`}
                >
                  {statusLabels[status]}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent">{shortDate(date)}</p>
          <h2 className="display mt-1 text-3xl">Horários do dia</h2>
        </div>
        <span className="text-xs text-muted-foreground">{active.length} marcados</span>
      </div>
      {isLoading && <LoadingBlock label="Atualizando horários" />}
      {isError && <ErrorBlock onRetry={onRetry} />}
      {!isLoading && !isError && active.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center" data-testid="empty-staff-agenda">
          <Scissors className="mx-auto h-6 w-6 text-accent" />
          <p className="mt-3 text-sm font-semibold">Um dia aberto</p>
          <p className="mt-1 text-xs text-muted-foreground">Nenhum atendimento marcado para esta data.</p>
        </div>
      )}
      <div className="space-y-3">{active.map(row)}</div>
      {cancelled.length > 0 && (
        <div className="mt-5">
          <button onClick={() => setShowCancelled((value) => !value)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            {showCancelled ? 'Ocultar' : 'Mostrar'} {cancelled.length} cancelado(s)
          </button>
          {showCancelled && <div className="mt-3 space-y-3">{cancelled.map(row)}</div>}
        </div>
      )}
      <CompleteDialog
        appointment={completing}
        onClose={() => setCompleting(null)}
        onConfirm={(amount) => completing && changeStatus(completing, 'completed', amount)}
        busy={statusMutation.isPending}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Schedule controls
// ---------------------------------------------------------------------------

function slotTimes(startsAt: string, endsAt: string) {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const times: string[] = [];
  for (let minute = toMinutes(startsAt); minute < toMinutes(endsAt); minute += 30) {
    times.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  return times;
}

function ScheduleCard({ professionalId, date, busyTimes }: { professionalId: number; date: string; busyTimes: string[] }) {
  const qc = useQueryClient();
  const params = { date, professionalId };
  const settings = useGetScheduleSettings(params, { query: { queryKey: getGetScheduleSettingsQueryKey(params) } });
  const updateSchedule = useUpdateSchedule();
  const updateSlot = useUpdateSlot();
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (settings.data) {
      setStartsAt(settings.data.startsAt);
      setEndsAt(settings.data.endsAt);
      setNote(settings.data.note ?? '');
    }
  }, [settings.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetScheduleSettingsQueryKey(params) });
    qc.invalidateQueries({ queryKey: getGetAvailabilityQueryKey() });
  };
  const onError = (error: unknown) =>
    toast({ variant: 'destructive', title: 'Não foi possível salvar', description: apiErrorMessage(error, 'Tente novamente.') });

  const save = (open: boolean) => {
    if (!settings.data) return;
    updateSchedule.mutate(
      { data: { professionalId, date, open, startsAt, endsAt, note: note.trim() || null } },
      {
        onSuccess: () => {
          refresh();
          toast({ title: open ? 'Expediente salvo' : 'Dia fechado para agendamentos' });
        },
        onError,
      },
    );
  };

  const toggleSlot = (time: string, blocked: boolean) =>
    updateSlot.mutate(
      { data: { professionalId, date, time, blocked } },
      { onSuccess: () => { refresh(); toast({ title: blocked ? `${time} bloqueado` : `${time} liberado` }); }, onError },
    );

  const data = settings.data;
  const blocked = new Set(data?.blockedTimes ?? []);
  const changed = data && (startsAt !== data.startsAt || endsAt !== data.endsAt || (note.trim() || null) !== (data.note ?? null));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-accent">expediente do dia</p>
            <h3 className="display mt-1 text-3xl">Horário</h3>
          </div>
          <Settings2 className="h-5 w-5 text-accent" />
        </div>
        {settings.isLoading && <div className="skeleton mt-5 h-20 rounded-xl" />}
        {settings.isError && <div className="mt-4"><ErrorBlock onRetry={() => settings.refetch()} /></div>}
        {data && (
          <>
            <div className="mt-5 flex items-center justify-between rounded-xl bg-muted p-4">
              <span className="text-sm font-semibold">{data.open ? 'Aberto para agendamentos' : 'Fechado'}</span>
              <button
                onClick={() => save(!data.open)}
                disabled={updateSchedule.isPending}
                role="switch"
                aria-checked={data.open}
                aria-label="Abrir ou fechar o dia"
                className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${data.open ? 'bg-accent' : 'bg-border'}`}
                data-testid="button-toggle-schedule"
              >
                <span className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-card transition-transform ${data.open ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {data.open && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Início
                  <input type="time" step={1800} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground" data-testid="input-starts-at" />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Fim
                  <input type="time" step={1800} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground" data-testid="input-ends-at" />
                </label>
              </div>
            )}
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Observação interna
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Ex.: curso à tarde" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm normal-case tracking-normal text-foreground" data-testid="input-schedule-note" />
            </label>
            {changed && (
              <button
                onClick={() => save(data.open)}
                disabled={updateSchedule.isPending}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                data-testid="button-save-schedule"
              >
                {updateSchedule.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar alterações
              </button>
            )}
          </>
        )}
      </div>

      {data?.open && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent">controle rápido</p>
          <h3 className="display mt-1 text-3xl">Bloquear horários</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Toque para bloquear um intervalo de 30 min (pausa, compromisso). Toque de novo para liberar.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {slotTimes(data.startsAt, data.endsAt).map((time) => {
              const isBlocked = blocked.has(time);
              const isBusy = busyTimes.includes(time);
              return (
                <button
                  key={time}
                  disabled={updateSlot.isPending || (isBusy && !isBlocked)}
                  onClick={() => toggleSlot(time, !isBlocked)}
                  title={isBusy ? 'Atendimento marcado' : isBlocked ? 'Liberar' : 'Bloquear'}
                  className={`flex h-9 items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors ${
                    isBlocked
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : isBusy
                        ? 'cursor-not-allowed border-border/50 bg-muted text-muted-foreground'
                        : 'border-border hover:border-accent'
                  }`}
                  data-testid={`button-block-${time}`}
                >
                  {isBlocked && <Lock className="h-3 w-3" />}
                  {time}
                </button>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive/60" /> bloqueado</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> com cliente</span>
          </p>
        </div>
      )}
    </div>
  );
}

/** Half-hour marks occupied by active appointments (can't be blocked). */
function busyTimesOf(appointments: Appointment[]) {
  const times: string[] = [];
  for (const item of appointments) {
    if (item.status === 'cancelled') continue;
    const start = Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3, 5));
    for (let minute = start; minute < start + item.service.durationMinutes; minute += 30) {
      times.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
    }
  }
  return times;
}

function agendaMetrics(appointments: Appointment[]) {
  const active = appointments.filter((item) => item.status !== 'cancelled');
  return {
    total: active.length,
    completed: active.filter((item) => item.status === 'completed').length,
    received: active.reduce((sum, item) => sum + (item.receivedAmount ?? 0), 0),
    expected: active.filter((item) => item.status !== 'no_show').reduce((sum, item) => sum + item.expectedAmount, 0),
  };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export function StaffDashboard() {
  const [date, setDate] = useDashboardDate();
  const qc = useQueryClient();
  const { me, loading, signedOut, authFailed } = useStaffMe();
  const professionalId = me.data?.professional?.id;
  const agendaParams = { date, professionalId };
  const agenda = useGetStaffAgenda(agendaParams, {
    query: { enabled: Boolean(professionalId), queryKey: getGetStaffAgendaQueryKey(agendaParams), refetchInterval: 60_000 },
  });
  const appointments = agenda.data ?? [];
  const metrics = agendaMetrics(appointments);

  if (loading) return <StaffShell title="Minha agenda" date={date} setDate={setDate}><div className="mt-8"><LoadingBlock label="Abrindo sua agenda" /></div></StaffShell>;
  if (signedOut) return <StaffShell title="Minha agenda" date={date} setDate={setDate}><AuthNotice title="Entre para ver sua agenda" /></StaffShell>;
  if (authFailed || me.isError) return <StaffShell title="Minha agenda" date={date} setDate={setDate}><AccessDenied error={me.error} authFailed={authFailed} /></StaffShell>;
  if (me.data?.role === 'admin') return <Redirect to="/admin" />;

  return (
    <StaffShell title={`Olá, ${firstName(me.data?.displayName ?? '')}`} eyebrow="minha agenda" date={date} setDate={setDate}>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric label="Atendimentos" value={String(metrics.total)} note="marcados no dia" icon={<CalendarDays className="h-4 w-4" />} />
        <Metric label="Concluídos" value={String(metrics.completed)} note={`de ${metrics.total}`} icon={<Check className="h-4 w-4" />} />
        <Metric label="Recebido" value={money(metrics.received)} note={`previsto ${money(metrics.expected)}`} icon={<CreditCard className="h-4 w-4" />} />
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <AgendaList
          appointments={appointments}
          date={date}
          onChanged={() => qc.invalidateQueries({ queryKey: getGetStaffAgendaQueryKey(agendaParams) })}
          isLoading={agenda.isLoading}
          isError={agenda.isError}
          onRetry={() => agenda.refetch()}
        />
        <aside>{professionalId && <ScheduleCard professionalId={professionalId} date={date} busyTimes={busyTimesOf(appointments)} />}</aside>
      </div>
    </StaffShell>
  );
}

function AdminAgenda({ date, team }: { date: string; team: Professional[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const agendaParams = { date, professionalId: selected ?? undefined };
  const agenda = useGetStaffAgenda(agendaParams, {
    query: { queryKey: getGetStaffAgendaQueryKey(agendaParams), refetchInterval: 60_000 },
  });
  const appointments = agenda.data ?? [];
  return (
    <div className="mt-12">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Agenda de</span>
        {[{ id: null, name: 'Todas' } as { id: number | null; name: string }, ...team.map((item) => ({ id: item.id, name: item.name }))].map((item) => (
          <button
            key={item.id ?? 'all'}
            onClick={() => setSelected(item.id)}
            aria-pressed={selected === item.id}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              selected === item.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-accent'
            }`}
            data-testid={`button-filter-professional-${item.id ?? 'all'}`}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <AgendaList
          appointments={appointments}
          date={date}
          showProfessional={!selected}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: getGetStaffAgendaQueryKey() });
            qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey({ date }) });
          }}
          isLoading={agenda.isLoading}
          isError={agenda.isError}
          onRetry={() => agenda.refetch()}
        />
        <aside>
          {selected ? (
            <ScheduleCard professionalId={selected} date={date} busyTimes={busyTimesOf(appointments)} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              Escolha uma profissional acima para abrir ou fechar o dia e bloquear horários dela.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function AdminContent({ summary }: { summary: AdminSummary }) {
  const salon = useSalon();
  const items = [
    { label: 'Agendamentos', value: String(summary.appointments), note: `${summary.completed} concluídos`, icon: <CalendarDays className="h-4 w-4" /> },
    { label: 'Recebido', value: money(summary.totalReceived), note: 'movimentado no dia', icon: <CreditCard className="h-4 w-4" /> },
    { label: 'Instituto', value: money(summary.salonShare), note: `participação do salão (${salon.salonSharePercent}%)`, icon: <Sparkles className="h-4 w-4" /> },
    { label: 'Cancelamentos', value: String(summary.cancelled), note: `${summary.noShows} faltas`, icon: <X className="h-4 w-4" /> },
  ];
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Metric key={item.label} {...item} />
        ))}
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-accent">leitura do dia</p>
              <h2 className="display mt-1 text-3xl">Por profissional</h2>
            </div>
            <span className="text-xs text-muted-foreground">{shortDate(summary.date)}</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {summary.byProfessional.map((item) => (
              <div key={item.professional.id} className="flex flex-wrap items-center gap-4 border-b border-border p-5 last:border-0" data-testid={`row-professional-${item.professional.id}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{item.professional.initials}</div>
                <div className="min-w-[140px] flex-1">
                  <p className="font-semibold">{item.professional.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.completed} atendimento(s) concluído(s)</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{money(item.totalReceived)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">repasse {money(item.professionalShare)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-primary p-6 text-primary-foreground">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent">fechamento</p>
          <h2 className="display mt-2 text-4xl">O que fica para o instituto</h2>
          <div className="gold-rule my-7" />
          <div className="flex items-end justify-between">
            <span className="text-sm text-primary-foreground/70">Participação VS</span>
            <strong className="text-3xl">{money(summary.salonShare)}</strong>
          </div>
          <div className="mt-5 flex items-end justify-between border-t border-primary-foreground/15 pt-5">
            <span className="text-sm text-primary-foreground/70">Repasses</span>
            <strong>{money(summary.professionalShare)}</strong>
          </div>
          <p className="mt-8 text-xs leading-5 text-primary-foreground/60">Valores consolidados a partir dos atendimentos concluídos e recebidos no dia.</p>
        </section>
      </div>
    </>
  );
}

export function AdminDashboard() {
  const [date, setDate] = useDashboardDate();
  const { me, loading, signedOut, authFailed } = useStaffMe();
  const isAdmin = me.data?.role === 'admin';
  const summary = useGetAdminSummary({ date }, { query: { enabled: isAdmin, queryKey: getGetAdminSummaryQueryKey({ date }), refetchInterval: 60_000 } });
  const team = useListProfessionals();

  if (loading) return <StaffShell title="Visão geral" date={date} setDate={setDate}><div className="mt-8"><LoadingBlock label="Abrindo operação" /></div></StaffShell>;
  if (signedOut) return <StaffShell title="Visão geral" date={date} setDate={setDate}><AuthNotice title="Acesso da administração" /></StaffShell>;
  if (me.data?.role === 'professional') return <Redirect to="/equipe" />;
  if (authFailed || me.isError || !isAdmin) return <StaffShell title="Visão geral" date={date} setDate={setDate}><AccessDenied error={me.error} authFailed={authFailed} /></StaffShell>;

  return (
    <StaffShell title="Visão geral" eyebrow="administração" date={date} setDate={setDate}>
      {summary.isError && <div className="mt-8"><ErrorBlock onRetry={() => summary.refetch()} /></div>}
      {summary.isLoading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-32 rounded-2xl" />
          ))}
        </div>
      )}
      {summary.data && <AdminContent summary={summary.data} />}
      <AdminAgenda date={date} team={team.data ?? []} />
    </StaffShell>
  );
}
