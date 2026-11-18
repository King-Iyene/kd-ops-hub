import { Camera, Check, Headphones, Mic, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LABEL, SURFACE } from '../ui';

type Dev = { deviceId: string; label: string };

/** Pick the microphone, speaker and camera, and cut background noise. Opens from a small button in the bottom bar. */
export function DeviceMenu({ mics, cams, speakers, pick, noise, dataSaver, onMic, onCam, onSpeaker, onNoise, onDataSaver, onOpen }: {
  mics: Dev[];
  cams: Dev[];
  speakers: Dev[];
  pick: { mic: string; cam: string; speaker: string };
  noise: boolean;
  dataSaver: boolean;
  onMic: (id: string) => void;
  onCam: (id: string) => void;
  onSpeaker: (id: string) => void;
  onNoise: (on: boolean) => void;
  onDataSaver: (on: boolean) => void;
  onOpen: () => void;
}) {
  const list = (title: string, icon: JSX.Element, items: Dev[], value: string, choose: (id: string) => void, name: string) => (
    <div>
      <p className={`${LABEL} mb-1.5 flex items-center gap-1.5`}>{icon}{title}</p>
      <div className="space-y-0.5">
        {items.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">None found. Allow access in your browser, then reopen this.</p>}
        {items.map((d, i) => {
          const on = value ? value === d.deviceId : d.deviceId === 'default' || i === 0;
          return (
            <button key={d.deviceId || i} type="button" onClick={() => choose(d.deviceId)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition ${on ? 'bg-primary/10 font-semibold' : 'hover:bg-white/[0.07]'}`}>
              <span className="min-w-0 flex-1 truncate">{d.label || `${name} ${i + 1}`}</span>
              {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <Popover onOpenChange={(o) => { if (o) onOpen(); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Microphone, speaker and camera settings" title="Microphone, speaker and camera" className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted"><Settings2 className="h-4 w-4" /></button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={12} className={`ko ${SURFACE} max-h-[70vh] w-[22rem] max-w-[calc(100vw-1rem)] space-y-4 overflow-y-auto p-4`}>
        {list('Microphone', <Mic className="h-3 w-3" />, mics, pick.mic, onMic, 'Microphone')}
        {list('Speaker', <Headphones className="h-3 w-3" />, speakers, pick.speaker, onSpeaker, 'Speaker')}
        {list('Camera', <Camera className="h-3 w-3" />, cams, pick.cam, onCam, 'Camera')}
        <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/[0.07]">
          <span className="min-w-0 pr-3">
            <span className="block text-[13px] font-semibold">Reduce background noise</span>
            <span className="block text-[11.5px] text-muted-foreground">Cuts keyboard clicks, fans and room noise from your microphone.</span>
          </span>
          <button type="button" role="switch" aria-checked={noise} onClick={() => onNoise(!noise)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${noise ? 'bg-primary' : 'bg-white/15'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${noise ? 'left-[1.15rem]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/[0.07]">
          <span className="min-w-0 pr-3">
            <span className="block text-[13px] font-semibold">Data saver</span>
            <span className="block text-[11.5px] text-muted-foreground">A small, light camera picture, so calls use far less data. Voice stays clear.</span>
          </span>
          <button type="button" role="switch" aria-checked={dataSaver} onClick={() => onDataSaver(!dataSaver)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${dataSaver ? 'bg-primary' : 'bg-white/15'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${dataSaver ? 'left-[1.15rem]' : 'left-0.5'}`} />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
