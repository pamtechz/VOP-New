import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Truck, ShieldCheck, MapPin, UserCheck, KeyRound, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface DriverRow {
  id: string;
  vehicle_type: string;
  vehicle_number: string;
  is_verified: boolean;
  is_online: boolean;
  rating: number;
  total_deliveries: number;
  profiles: { full_name: string; phone: string | null } | null;
}

interface DeliveryJobRow {
  id: string;
  order_id: string;
  status: string;
  pickup_pin: string;
  dropoff_pin: string;
  created_at: string;
  driver_profiles: { vehicle_type: string; profiles: { full_name: string } | null } | null;
}

export default async function AdminDeliveriesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function toggleDriverVerificationAction(formData: FormData) {
    'use server';
    const driverId = formData.get('driverId') as string;
    const currentStatus = formData.get('currentStatus') === 'true';
    const client = await createServerSupabaseClient();

    await client
      .from('driver_profiles')
      .update({ is_verified: !currentStatus })
      .eq('id', driverId);

    revalidatePath('/deliveries');
  }

  const [{ data: driversData }, { data: jobsData }] = await Promise.all([
    supabase
      .from('driver_profiles')
      .select('id, vehicle_type, vehicle_number, is_verified, is_online, rating, total_deliveries, profiles(full_name, phone)')
      .limit(50),
    supabase
      .from('delivery_jobs')
      .select('id, order_id, status, pickup_pin, dropoff_pin, created_at, driver_profiles(vehicle_type, profiles(full_name))')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const drivers: DriverRow[] = (driversData ?? []) as unknown as DriverRow[];
  const jobs: DeliveryJobRow[] = (jobsData ?? []) as unknown as DeliveryJobRow[];

  const onlineCount = drivers.filter(d => d.is_online).length;
  const activeJobsCount = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-400" />
            Delivery Fleet & Real-Time Logistics
          </h1>
          <p className="text-slate-400 text-sm">
            {drivers.length} registered drivers · {onlineCount} online now · {activeJobsCount} active dispatches
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          ZERO-TRUST HANDSHAKE ACTIVE
        </span>
      </div>

      {/* Driver Fleet Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-purple-400" />
          Driver Network Profiles
        </h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
              <tr>
                <th className="p-4">Driver Name</th>
                <th className="p-4">Phone</th>
                <th className="p-4">Vehicle</th>
                <th className="p-4">Status</th>
                <th className="p-4">Deliveries</th>
                <th className="p-4">Verification Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {drivers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No registered drivers in network. Drivers appear when users register as delivery agents.
                  </td>
                </tr>
              ) : (
                drivers.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/50">
                    <td className="p-4 font-semibold text-white">
                      {(d.profiles as any)?.full_name ?? '—'}
                    </td>
                    <td className="p-4 text-xs text-slate-400">
                      {(d.profiles as any)?.phone ?? '—'}
                    </td>
                    <td className="p-4 text-xs text-blue-400 font-mono">
                      {d.vehicle_type.toUpperCase()} ({d.vehicle_number})
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                        d.is_online
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {d.is_online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-white">
                      {d.total_deliveries} trips (★ {d.rating.toFixed(1)})
                    </td>
                    <td className="p-4">
                      <form action={toggleDriverVerificationAction}>
                        <input type="hidden" name="driverId" value={d.id} />
                        <input type="hidden" name="currentStatus" value={String(d.is_verified)} />
                        <button
                          type="submit"
                          className={`px-3 py-1 text-xs font-bold rounded border transition-colors ${
                            d.is_verified
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                          }`}
                        >
                          {d.is_verified ? 'Revoke Verification' : 'Approve Driver'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Jobs Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-amber-400" />
          Active Dispatch Jobs & Security Handshakes
        </h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
              <tr>
                <th className="p-4">Job ID</th>
                <th className="p-4">Order ID</th>
                <th className="p-4">Pickup PIN</th>
                <th className="p-4">Delivery OTP</th>
                <th className="p-4">Status</th>
                <th className="p-4">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No active delivery jobs. Jobs appear when sellers dispatch items.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-800/50">
                    <td className="p-4 font-mono text-xs text-blue-400">{j.id.slice(0, 8)}</td>
                    <td className="p-4 font-mono text-xs text-slate-400">{j.order_id.slice(0, 8)}</td>
                    <td className="p-4 font-mono font-bold text-amber-400 tracking-wider">
                      {j.pickup_pin}
                    </td>
                    <td className="p-4 font-mono font-bold text-emerald-400 tracking-wider">
                      {j.dropoff_pin}
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                        {j.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-400">
                      {new Date(j.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
