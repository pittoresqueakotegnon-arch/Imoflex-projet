export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return 'Bonjour 🌅';
  } else if (hour >= 12 && hour < 17) {
    return 'Bon après-midi 🌤️';
  } else {
    return 'Bonsoir 🌙';
  }
}
