export interface NeonAvatar {
  id: string;
  name: string;
  src: string;
  glowColor: string;
  borderGradient: string;
}

export const NEON_AVATARS: NeonAvatar[] = [
  {
    id: 'avatar_1',
    name: 'Cyber Runner',
    src: '/assets/avatars/avatar_1.png',
    glowColor: '#00f2fe',
    borderGradient: 'linear-gradient(135deg, #00f2fe, #4facfe)',
  },
  {
    id: 'avatar_2',
    name: 'Synthwave Rebel',
    src: '/assets/avatars/avatar_2.png',
    glowColor: '#ec4899',
    borderGradient: 'linear-gradient(135deg, #ec4899, #a855f7)',
  },
  {
    id: 'avatar_3',
    name: 'Neon Ninja',
    src: '/assets/avatars/avatar_3.png',
    glowColor: '#fbbf24',
    borderGradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  },
  {
    id: 'avatar_4',
    name: 'Holo Pilot',
    src: '/assets/avatars/avatar_4.png',
    glowColor: '#38bdf8',
    borderGradient: 'linear-gradient(135deg, #38bdf8, #6366f1)',
  },
  {
    id: 'avatar_5',
    name: 'Matrix Hacker',
    src: '/assets/avatars/avatar_5.png',
    glowColor: '#22c55e',
    borderGradient: 'linear-gradient(135deg, #22c55e, #10b981)',
  },
  {
    id: 'avatar_6',
    name: 'Cyber Valkyrie',
    src: '/assets/avatars/avatar_6.png',
    glowColor: '#f97316',
    borderGradient: 'linear-gradient(135deg, #f97316, #fbbf24)',
  },
  {
    id: 'avatar_7',
    name: 'Arcade Legend',
    src: '/assets/avatars/avatar_7.png',
    glowColor: '#f43f5e',
    borderGradient: 'linear-gradient(135deg, #f43f5e, #06b6d4)',
  },
  {
    id: 'avatar_8',
    name: 'Cosmic Android',
    src: '/assets/avatars/avatar_8.png',
    glowColor: '#c084fc',
    borderGradient: 'linear-gradient(135deg, #c084fc, #818cf8)',
  },
  {
    id: 'avatar_9',
    name: 'Electric Phoenix',
    src: '/assets/avatars/avatar_9.png',
    glowColor: '#ff8c00',
    borderGradient: 'linear-gradient(135deg, #ff8c00, #ef4444)',
  },
  {
    id: 'avatar_10',
    name: 'Phantom Spirit',
    src: '/assets/avatars/avatar_10.png',
    glowColor: '#00f2fe',
    borderGradient: 'linear-gradient(135deg, #00f2fe, #ec4899)',
  },
];

export function getAvatarPath(avatarId?: string | null): string {
  if (!avatarId) return '/assets/avatars/avatar_1.png';
  const found = NEON_AVATARS.find((a) => a.id === avatarId);
  return found ? found.src : '/assets/avatars/avatar_1.png';
}

export function getAvatarConfig(avatarId?: string | null): NeonAvatar {
  if (!avatarId) return NEON_AVATARS[0];
  const found = NEON_AVATARS.find((a) => a.id === avatarId);
  return found || NEON_AVATARS[0];
}
