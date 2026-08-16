import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Camera, MapPin, Loader2, LogIn, LogOut, X, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Employee-facing clock-in/out card.
 *
 * Flow:
 *   1. On mount, load today's attendance record for the current user.
 *   2. If clocked in, show CLOCK OUT (with clock-in badge). Else CLOCK IN.
 *   3. Clock IN opens the front camera (getUserMedia), captures a still,
 *      grabs current GPS coords (best-effort — user may deny), and upserts
 *      the attendance row with clock_in TIME, lat/lng and selfie path.
 *   4. Clock OUT is a lightweight repeat that adds clock_out TIME + geo.
 *
 * All external permissions (camera, geolocation) are best-effort — a
 * denial doesn't block the clock-in itself, it just leaves the audit
 * fields null. The primary business action (recording attendance) always
 * succeeds.
 *
 * PWA-ready: uses only browser APIs (getUserMedia + Geolocation + Storage).
 * No native modules required.
 */

const BUCKET = 'attendance-selfies';

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 8); // HH:MM:SS

interface AttendanceRow {
  id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_selfie_path: string | null;
}

interface ClockInWidgetProps {
  /** HH:MM cutoff after which a clock-in is flagged 'late'. Defaults to 09:15. */
  lateThreshold?: string;
}

export const ClockInWidget = ({ lateThreshold = '09:15' }: ClockInWidgetProps) => {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [today_, setToday_] = useState<AttendanceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [capturedPng, setCapturedPng] = useState<string | null>(null);
  const [selfieSignedUrl, setSelfieSignedUrl] = useState<string | null>(null);

  // Load today's record
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('attendance_records')
        .select('id, work_date, clock_in, clock_out, status, clock_in_lat, clock_in_lng, clock_in_selfie_path')
        .eq('employee_id', profile.id)
        .eq('work_date', today())
        .maybeSingle();
      setToday_((data as AttendanceRow) || null);
      if ((data as any)?.clock_in_selfie_path) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl((data as any).clock_in_selfie_path, 300);
        if (signed?.signedUrl) setSelfieSignedUrl(signed.signedUrl);
      }
      setLoading(false);
    })();
  }, [profile?.id]);

  // Ensure any open camera stream is closed on unmount
  useEffect(() => () => {
    stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  const isClockedIn = !!today_?.clock_in;
  const isClockedOut = !!today_?.clock_out;

  // Fire up the camera
  const startCamera = async () => {
    setCapturing(true);
    setCapturedPng(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch (err: any) {
      toast({
        title: 'Camera unavailable',
        description: err?.message ?? 'Camera permission denied. Continuing without selfie.',
        variant: 'destructive',
      });
      // Still allow the user to clock in without a selfie
      setCapturing(false);
    }
  };

  const takeShot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth || 480;
    c.height = v.videoHeight || 480;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setCapturedPng(c.toDataURL('image/jpeg', 0.75));
    // Stop the stream once we have a still
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };

  const retake = () => {
    setCapturedPng(null);
    startCamera();
  };

  const cancelCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCapturing(false);
    setCapturedPng(null);
  };

  // Best-effort geolocation. Never blocks — 3 s timeout.
  const getGeo = (): Promise<{ lat: number; lng: number; accuracy: number } | null> =>
    new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      let done = false;
      const timeout = setTimeout(() => {
        if (!done) { done = true; resolve(null); }
      }, 3000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (done) return;
          done = true; clearTimeout(timeout);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        () => { if (!done) { done = true; clearTimeout(timeout); resolve(null); } },
        { enableHighAccuracy: false, timeout: 2800 },
      );
    });

  const dataUrlToBlob = (dataUrl: string): Blob => {
    const [meta, body] = dataUrl.split(',');
    const mime = /:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  // ─── Clock IN ────────────────────────────────────────────────────────
  const clockIn = async () => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const geo = await getGeo();
      let selfiePath: string | null = null;
      if (capturedPng) {
        const path = `${profile.id}/${today()}-in.jpg`;
        const blob = dataUrlToBlob(capturedPng);
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
        if (upErr) console.warn('[ClockIn] selfie upload failed:', upErr.message);
        else selfiePath = path;
      }
      // Late detection — anything after lateThreshold flags status='late'.
      const [thresholdHours, thresholdMinutes] = lateThreshold.split(':').map(Number);
      const t = new Date();
      const status = t.getHours() > thresholdHours ||
        (t.getHours() === thresholdHours && t.getMinutes() > thresholdMinutes)
        ? 'late'
        : 'present';
      const payload = {
        employee_id: profile.id,
        work_date: today(),
        clock_in: nowTime(),
        clock_in_lat: geo?.lat ?? null,
        clock_in_lng: geo?.lng ?? null,
        clock_in_accuracy_m: geo?.accuracy ?? null,
        clock_in_selfie_path: selfiePath,
        clock_in_via: 'web',
        status,
        recorded_by: profile.id,
      };
      const { data, error } = await supabase
        .from('attendance_records')
        .upsert(payload, { onConflict: 'employee_id,work_date' })
        .select('*')
        .single();
      if (error) throw error;
      setToday_(data as AttendanceRow);
      if (selfiePath) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(selfiePath, 300);
        setSelfieSignedUrl(signed?.signedUrl ?? null);
      }
      await logAudit(
        'attendance_clock_in' as any,
        `Clocked in at ${nowTime()}${geo ? ` @ ${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}` : ''}`,
        profile,
      );
      toast({
        title: `Clocked in — ${status === 'late' ? 'Late' : 'On time'}`,
        description: geo ? `Location captured (±${Math.round(geo.accuracy)}m)` : 'Location unavailable',
      });
      setCapturing(false);
      setCapturedPng(null);
    } catch (err: any) {
      toast({
        title: 'Clock-in failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Clock OUT ───────────────────────────────────────────────────────
  const clockOut = async () => {
    if (!today_ || !profile?.id) return;
    setSaving(true);
    try {
      const geo = await getGeo();
      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          clock_out: nowTime(),
          clock_out_lat: geo?.lat ?? null,
          clock_out_lng: geo?.lng ?? null,
          clock_out_accuracy_m: geo?.accuracy ?? null,
          clock_out_via: 'web',
        })
        .eq('id', today_.id)
        .select('*')
        .single();
      if (error) throw error;
      setToday_(data as AttendanceRow);
      await logAudit(
        'attendance_clock_out' as any,
        `Clocked out at ${nowTime()}`,
        profile,
      );
      toast({ title: 'Clocked out. Have a good rest.' });
    } catch (err: any) {
      toast({ title: 'Clock-out failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {isClockedOut ? '🏁 Day complete' : isClockedIn ? '⏱️ You are clocked in' : '👋 Clock in for today'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* Status row */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge
                variant="secondary"
                className={cn(
                  'text-[11px]',
                  today_?.status === 'late' ? 'bg-warning/10 text-warning' :
                  today_?.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-muted text-muted-foreground',
                )}
              >
                {today_?.status || 'not clocked in'}
              </Badge>
              {today_?.clock_in && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <LogIn className="h-3 w-3" /> {today_.clock_in}
                </span>
              )}
              {today_?.clock_out && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <LogOut className="h-3 w-3" /> {today_.clock_out}
                </span>
              )}
              {today_?.clock_in_lat != null && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Location captured
                </span>
              )}
            </div>

            {/* Preview of today's selfie */}
            {selfieSignedUrl && (
              <div className="flex items-center gap-3">
                <img
                  src={selfieSignedUrl}
                  alt="Clock-in selfie"
                  className="h-16 w-16 rounded-lg object-cover border"
                />
                <div className="text-xs text-muted-foreground">
                  Today's clock-in selfie
                  <p className="text-[10px] mt-0.5">Private — signed URL expires in 5 min</p>
                </div>
              </div>
            )}

            {/* Camera capture UI (only visible during capture) */}
            {capturing && (
              <div className="space-y-2">
                {!capturedPng ? (
                  <>
                    <div className="rounded-lg overflow-hidden border bg-black flex items-center justify-center h-56">
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        autoPlay
                        playsInline
                        muted
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={takeShot} size="sm" className="flex-1">
                        <Camera className="mr-2 h-4 w-4" /> Take photo
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelCamera}
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg overflow-hidden border bg-black h-56">
                      <img src={capturedPng} className="w-full h-full object-cover" alt="Selfie preview" />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={clockIn} disabled={saving} size="sm" className="flex-1">
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Confirm & clock in
                      </Button>
                      <Button variant="outline" size="sm" onClick={retake}>
                        <RefreshCw className="mr-1 h-4 w-4" /> Retake
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Main action buttons */}
            {!capturing && !isClockedIn && (
              <div className="flex gap-2">
                <Button onClick={startCamera} disabled={saving} className="flex-1">
                  <Camera className="mr-2 h-4 w-4" /> Clock in with selfie
                </Button>
                <Button variant="outline" onClick={clockIn} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Skip selfie'}
                </Button>
              </div>
            )}
            {!capturing && isClockedIn && !isClockedOut && (
              <Button onClick={clockOut} disabled={saving} variant="secondary" className="w-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <LogOut className="mr-2 h-4 w-4" /> Clock out
              </Button>
            )}
            {isClockedOut && (
              <p className="text-xs text-muted-foreground text-center">
                You've completed today. See you tomorrow 👋
              </p>
            )}
          </>
        )}
        {/* Hidden capture canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </CardContent>
    </Card>
  );
};

export default ClockInWidget;
