/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./apps/**/*.{html,ts}', './libs/**/*.{html,ts}'],
  theme: {
    extend: {}
  },
  daisyui: {
    darkTheme: 'cluedo-player',
    themes: [
      {
        'cluedo-player': {
          primary: '#6366F1',
          secondary: '#22C55E',
          accent: '#F59E0B',
          'base-100': '#0F172A',
          'base-200': '#1E293B',
          'base-content': '#F1F5F9'
        }
      },
      {
        'cluedo-master': {
          primary: '#E11D48',
          secondary: '#9333EA',
          accent: '#FBBF24',
          'base-100': '#0F172A',
          'base-200': '#1E293B',
          'base-content': '#F1F5F9'
        }
      }
    ]
  },
  plugins: [require('daisyui')]
};
