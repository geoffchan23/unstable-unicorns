import type { Avatar as AvatarSpec } from '../avatars';

export function Avatar({ avatar, size = 'md', active = false, hit = false, offline = false, anchorRef }: {
  avatar: AvatarSpec; size?: 'sm' | 'md' | 'lg'; active?: boolean; hit?: boolean; offline?: boolean; anchorRef?: (el: HTMLElement | null) => void;
}) {
  const cls = ['avatar', `avatar-${size}`, active ? 'active' : '', hit ? 'hit' : '', offline ? 'offline' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ '--seat': avatar.color } as React.CSSProperties} ref={anchorRef as never} aria-hidden="true">
      <span className="avatar-face">{avatar.emoji}</span>
    </span>
  );
}
