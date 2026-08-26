import { useState } from 'react';
import { X, Check, Sparkles } from 'lucide-react';
import { NEON_AVATARS } from '../config/avatars';

interface AvatarSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatarId?: string | null;
  initData: string;
  backendUrl: string;
  onAvatarSaved: (newAvatarId: string) => void;
}

export function AvatarSelectModal({
  isOpen,
  onClose,
  currentAvatarId = 'avatar_1',
  initData,
  backendUrl,
  onAvatarSaved,
}: AvatarSelectModalProps) {
  const [selectedId, setSelectedId] = useState<string>(currentAvatarId || 'avatar_1');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentConfig = NEON_AVATARS.find((a) => a.id === selectedId) || NEON_AVATARS[0];

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/user/avatar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${initData}`,
        },
        body: JSON.stringify({ avatarId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Speichern des Profilbilds.');
      }
      onAvatarSaved(selectedId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Verbindungsfehler.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(4, 6, 15, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 1000001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out forwards',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #10162a 0%, #080c18 100%)',
          border: '1px solid rgba(0, 242, 254, 0.3)',
          boxShadow: '0 0 40px rgba(0, 242, 254, 0.15), 0 20px 40px rgba(0,0,0,0.8)',
          borderRadius: '24px',
          padding: '20px',
          width: '100%',
          maxWidth: '440px',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          animation: 'scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--accent-cyan)' }} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#fff', letterSpacing: '0.02em' }}>
              Neon Profilbild wählen
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Selected Preview Box */}
        <div style={{
          background: 'rgba(0,0,0,0.4)',
          border: `1px solid ${currentConfig.glowColor}55`,
          borderRadius: '18px',
          padding: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          marginBottom: '16px',
          boxShadow: `0 0 25px ${currentConfig.glowColor}22`,
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            overflow: 'hidden',
            flexShrink: 0,
            border: `2px solid ${currentConfig.glowColor}`,
            boxShadow: `0 0 15px ${currentConfig.glowColor}66`,
          }}>
            <img
              src={currentConfig.src}
              alt={currentConfig.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>
              Ausgewähltes Design
            </div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
              {currentConfig.name}
            </div>
            <div style={{ fontSize: '11px', color: currentConfig.glowColor, fontWeight: 700, marginTop: '2px' }}>
              ✦ 100% Kostenlos für alle Spieler
            </div>
          </div>
        </div>

        {/* Avatars Grid (10 items) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '10px',
          marginBottom: '18px',
        }}>
          {NEON_AVATARS.map((av) => {
            const isSelected = selectedId === av.id;
            return (
              <div
                key={av.id}
                onClick={() => setSelectedId(av.id)}
                style={{
                  position: 'relative',
                  aspectRatio: '1/1',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: isSelected ? `2px solid ${av.glowColor}` : '1px solid rgba(255,255,255,0.12)',
                  boxShadow: isSelected ? `0 0 15px ${av.glowColor}88` : 'none',
                  transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                  transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <img
                  src={av.src}
                  alt={av.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: '3px',
                    right: '3px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: av.glowColor,
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 8px ${av.glowColor}`,
                  }}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Error message if any */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px',
            padding: '10px 12px',
            color: '#f87171',
            fontSize: '11px',
            fontWeight: 700,
            marginBottom: '14px',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
            boxShadow: '0 0 20px rgba(0,242,254,0.4)',
            border: 'none',
            borderRadius: '14px',
            padding: '14px',
            color: '#000',
            fontWeight: 900,
            fontSize: '13px',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Sparkles size={16} />
          {saving ? 'Speichert Profilbild...' : 'Profilbild jetzt aktivieren'}
        </button>
      </div>
    </div>
  );
}
