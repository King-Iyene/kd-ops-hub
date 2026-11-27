import { toast } from '@/hooks/use-toast';
import { startDesktopDownload } from './desktopApp';

/** The Download button: starts the installer for this computer right here (no GitHub page) and tells the person what happened. */
export async function downloadDesktopApp(): Promise<void> {
  const r = await startDesktopDownload();
  if (r === 'started') toast({ title: 'Downloading the KD Ops app', description: 'Open the file when it has finished to install it.' });
  else if (r === 'phone') toast({ title: 'The app is for computers', description: 'Open this page on a Windows, Mac or Linux computer to get it.' });
  else toast({ title: 'The installer is not ready yet', description: 'It is being prepared. Please try again in a few minutes, or tell an admin.', variant: 'destructive' });
}
