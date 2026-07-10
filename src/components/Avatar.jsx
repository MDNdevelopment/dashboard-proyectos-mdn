const AVATAR_COLORS = [
  '#d97706','#059669','#2563eb','#7c3aed',
  '#db2777','#0891b2','#65a30d','#dc2626',
]

function avatarColor(userId) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function Avatar({ user, size = 28 }) {
  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
  const style = { width: size, height: size, fontSize: size * 0.38, flexShrink: 0 }

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={initials}
        style={{ ...style, borderRadius: '50%', objectFit: 'cover' }}
      />
    )
  }

  return (
    <span
      style={{ ...style, background: avatarColor(user.user_id), borderRadius: '50%', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}
    >
      {initials}
    </span>
  )
}
