import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Compass, ArrowLeft } from 'lucide-react';
import { AuthAtmosphere } from '@/components/AuthAtmosphere';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn('[KDOps] 404:', location.pathname);
  }, [location.pathname]);

  return (
    <AuthAtmosphere>
      <div className="relative z-10 text-center max-w-md">
        <div className="relative inline-flex mb-6">
          {/* Radar-scan ring — reads as the system still searching for
              the missing route, a small "robotic" touch that fits the
              lost-in-space narrative. */}
          <div className="kd-scan-ring" />
          <div className="absolute inset-0 rounded-full bg-[hsl(var(--tod-glow))] blur-2xl opacity-40" />
          <div className="relative h-20 w-20 rounded-full bg-white/5 backdrop-blur-md border border-white/15 flex items-center justify-center">
            <Compass className="h-9 w-9 text-white/90 kd-animate-spin-slow" />
          </div>
        </div>

        {/* One-shot glitch shake on mount — settles quickly, not a loop. */}
        <h1 className="kd-display text-7xl font-bold text-white tracking-tight mb-2 kd-glitch-shake">404</h1>
        <p className="kd-display text-xl text-white/80 mb-2">Lost in space</p>
        <p className="text-sm text-white/50 mb-8">
          The page <code className="bg-white/10 px-1.5 py-0.5 rounded text-white/70 text-xs">{location.pathname}</code> isn't on our map.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[hsl(var(--tod-aurora-1))] to-[hsl(var(--tod-aurora-2))] text-white font-semibold shadow-lg hover:opacity-90 kd-transition kd-tod-glow"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to base
        </Link>
      </div>
    </AuthAtmosphere>
  );
};

export default NotFound;
