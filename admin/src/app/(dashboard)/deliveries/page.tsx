import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  Truck,
  ShieldCheck,
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bike,
  Car,
  UserRoundCheck,
} from 'lucide-react';

interface DriverRow {
  id: string;
  full_name: string;
  phone: string;
  vehicle_type: string;
  vehicle_plate: string;
  verification_status: 'pending' | 'verified' | 'suspended';
  rating_avg: number;
  rating_count: number;
  is_online: boolean;
  last_active_at: string | null;
}

interface DeliveryJobRow {
  id: string;
  public_ref: string;
  order_id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  estimated_distance_km: number | null;
  estimated_duration_mins: number | null;
  delivery_fee: number;
  created_at: string;
  driver_profiles: {
    id: string;
    full_name: string;
    phone: string;
    vehicle_type: string;
    vehicle_plate: string;
  } | null;
}

const jobStatuses = [
  'unassigned',
  'assigned',
  'accepted',
  'arrived_at_pickup',
  'goods_picked_up',
  'in_transit',
  'arrived_at_dropoff',
  'delivered',
  'failed',
  'cancelled',
];

export default async function AdminDeliveriesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function updateDriverVerificationAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const driverId = String(formData.get('driverId') ?? '');
    const status = String(formData.get('verificationStatus') ?? '');
    if (!['pending', 'verified', 'suspended'].includes(status)) {
      throw new Error('Invalid courier verification state.');
    }

    const { error } = await client
      .from('driver_profiles')
      .update({ verification_status: status })
      .eq('id', driverId);
    if (error) throw new Error(error.message);

    revalidatePath('/deliveries');
  }

  async function updateDeliveryStatusAction(formData: FormData) {
    'use server';
    const client = await createServerSupabaseClient();
    const jobId = String(formData.get('jobId') ?? '');
    const status = String(formData.get('status') ?? '');
    if (!jobStatuses.includes(status)) throw new Error('Invalid delivery status.');

    const payload: Record<string, string | null> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'delivered') payload.delivered_at = new Date().toISOString();

    const { error } = await client.from('delivery_jobs').update(payload).eq('id', jobId);
    if (error) throw new Error(error.message);

    revalidatePath('/deliveries');
  }

  const [{ data: driversData, error: driversError }, { data: jobsData, error: jobsError }] =
    await Promise.all([
      supabase
        .from('driver_profiles')
        .select(
          'id, full_name, phone, vehicle_type, vehicle_plate, verification_status, rating_avg, rating_count, is_online, last_active_at',
        )
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('delivery_jobs')
        .select(
          'id, public_ref, order_id, status, pickup_address, dropoff_address, estimated_distance_km, estimated_duration_mins, delivery_fee, created_at, driver_profiles(id, full_name, phone, vehicle_type, vehicle_plate)',
        )
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

  const drivers = (driversData ?? []) as DriverRow[];
  const jobs = (jobsData ?? []) as unknown as DeliveryJobRow[];
  const onlineCount = drivers.filter((driver) => driver.is_online).length;
  const activeJobsCount = jobs.filter(
    (job) => !['delivered', 'failed', 'cancelled'].includes(job.status),
  ).length;

  const vehicleIcon = (type: string) => {
    if (type === 'bicycle') return <Bike className="h-4 w-4" />;
    if (type === 'car' || type === 'van') return <Car className="h-4 w-4" />;
    return <Truck className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Truck className="h-6 w-6 text-blue-400" />
            Courier & Delivery Operations
          </h1>
          <p className="text-sm text-slate-400">
            {drivers.length} couriers · {onlineCount} online · {activeJobsCount} active delivery jobs
          </p>
        </div>
        <span className="flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          LIVE SUPABASE DATA
        </span>
      </div>

      {(driversError || jobsError) && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
          {driversError?.message || jobsError?.message}
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
          <UserRoundCheck className="h-5 w-5 text-blue-400" />
          Courier Directory
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {drivers.map((driver) => (
            <article key={driver.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-white">
                    {vehicleIcon(driver.vehicle_type)}
                    {driver.full_name}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {driver.vehicle_type.toUpperCase()} · {driver.vehicle_plate}
                  </p>
                  <p className="mt-1 text-xs text-amber-400">
                    ★ {Number(driver.rating_avg ?? 0).toFixed(1)} ({driver.rating_count ?? 0})
                  </p>
                </div>
                <span className={`rounded border px-2 py-1 text-xs font-bold ${
                  driver.verification_status === 'verified'
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    : driver.verification_status === 'suspended'
                      ? 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                      : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                }`}>
                  {driver.verification_status.toUpperCase()}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`tel:${driver.phone}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500"
                >
                  <Phone className="h-4 w-4" />
                  Call courier
                </a>
                <span className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  driver.is_online
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {driver.is_online ? 'Online' : 'Offline'}
                </span>
              </div>

              <form action={updateDriverVerificationAction} className="mt-4 flex gap-2">
                <input type="hidden" name="driverId" value={driver.id} />
                <select
                  name="verificationStatus"
                  defaultValue={driver.verification_status}
                  className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                >
                  <option value="pending">Pending review</option>
                  <option value="verified">Verified</option>
                  <option value="suspended">Suspended</option>
                </select>
                <button className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">
                  Save
                </button>
              </form>
            </article>
          ))}
          {drivers.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-slate-500">
              No couriers registered.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
          <MapPin className="h-5 w-5 text-emerald-400" />
          Delivery Jobs
        </h2>
        <div className="space-y-3">
          {jobs.map((job) => (
            <article key={job.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
                <div>
                  <div className="font-mono text-xs font-bold text-blue-400">{job.public_ref}</div>
                  <div className="mt-2 flex items-start gap-2 text-sm text-slate-300">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{job.pickup_address} → {job.dropoff_address}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    {job.estimated_distance_km != null && <span>{job.estimated_distance_km} km</span>}
                    {job.estimated_duration_mins != null && <span><Clock className="mr-1 inline h-3 w-3" />{job.estimated_duration_mins} min</span>}
                    <span>K{Number(job.delivery_fee ?? 0).toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  {job.driver_profiles ? (
                    <>
                      <div className="text-sm font-semibold text-white">{job.driver_profiles.full_name}</div>
                      <div className="text-xs text-slate-400">
                        {job.driver_profiles.vehicle_type} · {job.driver_profiles.vehicle_plate}
                      </div>
                      <a
                        href={`tel:${job.driver_profiles.phone}`}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {job.driver_profiles.phone}
                      </a>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      Awaiting courier assignment
                    </div>
                  )}
                </div>

                <form action={updateDeliveryStatusAction} className="flex gap-2">
                  <input type="hidden" name="jobId" value={job.id} />
                  <select
                    name="status"
                    defaultValue={job.status}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                  >
                    {jobStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </article>
          ))}
          {jobs.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">No delivery jobs found.</div>
          )}
        </div>
      </section>
    </div>
  );
}
