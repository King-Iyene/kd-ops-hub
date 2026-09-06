import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Download, FileIcon } from 'lucide-react';
import type { AttachmentMeta } from './AttachmentManager';

interface AttachmentLightboxProps {
  attachments: AttachmentMeta[];
  initialIndex: number;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentLightbox({ attachments, initialIndex, onClose }: AttachmentLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const att = attachments[currentIndex];
  const isImage = att.type.startsWith('image/');
  const isPdf = att.type === 'application/pdf';
  const isVideo = att.type.startsWith('video/');
  const isAudio = att.type.startsWith('audio/');
  const hasMultiple = attachments.length > 1;

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    resetZoom();
  }, [resetZoom]);

  const goPrev = useCallback(() => {
    if (hasMultiple) goTo((currentIndex - 1 + attachments.length) % attachments.length);
  }, [currentIndex, attachments.length, hasMultiple, goTo]);

  const goNext = useCallback(() => {
    if (hasMultiple) goTo((currentIndex + 1) % attachments.length);
  }, [currentIndex, attachments.length, hasMultiple, goTo]);

  const zoomIn = useCallback(() => {
    if (isImage) setZoom((z) => Math.min(z + 0.5, 5));
  }, [isImage]);

  const zoomOut = useCallback(() => {
    if (isImage) setZoom((z) => Math.max(z - 0.5, 0.5));
  }, [isImage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goPrev();
          break;
        case 'ArrowRight':
          goNext();
          break;
        case '+':
        case '=':
          zoomIn();
          break;
        case '-':
          zoomOut();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goPrev, goNext, zoomIn, zoomOut]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isImage) return;
      e.preventDefault();
      setZoom((z) => {
        const next = z + (e.deltaY < 0 ? 0.25 : -0.25);
        return Math.min(Math.max(next, 0.5), 5);
      });
    },
    [isImage]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isImage || zoom <= 1) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { ...pan };
    },
    [isImage, zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({
        x: panStart.current.x + (e.clientX - dragStart.current.x),
        y: panStart.current.y + (e.clientY - dragStart.current.y),
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleImageClick = useCallback(() => {
    if (isDragging) return;
    setZoom((z) => (z === 1 ? 2 : 1));
    if (zoom !== 1) setPan({ x: 0, y: 0 });
  }, [isDragging, zoom]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0">
        {/* Left arrow */}
        {hasMultiple && (
          <button
            onClick={goPrev}
            className="absolute left-4 z-10 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        {/* Content */}
        {isImage && (
          <div
            className="w-full h-full flex items-center justify-center overflow-hidden"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={att.url}
              alt={att.name}
              onClick={handleImageClick}
              draggable={false}
              className="max-w-full max-h-full object-contain select-none transition-transform duration-150"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
              }}
            />
          </div>
        )}

        {isPdf && (
          <iframe src={att.url} title={att.name} className="w-full h-full border-0" />
        )}

        {isVideo && (
          <video src={att.url} controls className="max-w-full max-h-full">
            Your browser does not support the video element.
          </video>
        )}

        {isAudio && (
          <div className="flex items-center justify-center w-full">
            <audio src={att.url} controls className="w-96 max-w-full" />
          </div>
        )}

        {!isImage && !isPdf && !isVideo && !isAudio && (
          <div className="flex flex-col items-center gap-4 text-white">
            <FileIcon className="w-16 h-16 text-white/50" />
            <p className="text-lg">{att.name}</p>
            <a
              href={att.url}
              download={att.name}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          </div>
        )}

        {/* Right arrow */}
        {hasMultiple && (
          <button
            onClick={goNext}
            className="absolute right-4 z-10 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/60 text-white/80 text-sm">
        <div className="flex items-center gap-3">
          <span className="font-medium text-white">{att.name}</span>
          <span>{formatSize(att.size)}</span>
          <span className="px-2 py-0.5 bg-white/10 rounded text-xs">{att.type}</span>
        </div>
        <a
          href={att.url}
          download={att.name}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      </div>
    </div>
  );
}

export default React.memo(AttachmentLightbox);
