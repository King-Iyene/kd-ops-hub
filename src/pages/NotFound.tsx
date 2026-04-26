import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Compass, ArrowLeft } from 'lucide-react';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: route not found:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="kd-aurora min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(201,100%,8%)] via-[hsl(200,100%,14%)] to-[hsl(186,100%,12%)] -z-10" />
      <div className="pointer-events-none absolute inset-0 kd-hex-grid opacity-[0.15] mix-blend-overlay" />

      <div className="kd-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className="kd-particle"
            style={{
              left: `${(i * 7 + 3) % 100}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${9 + (i % 6)}s`,
              ['--drift-x' as any]: `${(i % 2 ? 1 : -1) * (10 + i * 2)}px`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center max-w-md">
        <div className="relative inline-flex mb-6">
          <div className="absolute inset-0 rounded-full bg-[hsl(var(--tod-glow))] blur-2xl opacity-40 kd-icon-glow" />
          <div className="relative h-20 w-20 rounded-full bg-white/5 backdrop-blur-md border border-white/15 flex items-center justify-center">
            <Compass className="h-9 w-9 text-white/90 kd-animate-spin-slow" />
          </div>
        </div>

        <h1 className="kd-display text-7xl font-bold text-white tracking-tight mb-2">404</h1>
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
    </div>
  );
};

export default NotFound;
