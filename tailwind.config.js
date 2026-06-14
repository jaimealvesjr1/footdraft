export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fifa: {
          green: "#3CAC3B",
          blue: "#2A398D",
          red: "#E61D25",
          gray: {
            light: "#D1D4D1",
            dark: "#474A4A"
          }
        }
      },
      fontFamily: {
        // 'fifa' será a classe que usaremos no código: font-fifa
        fifa: ['"Oswald"', 'sans-serif'], 
      }
    },
  },
  plugins: [],
}
