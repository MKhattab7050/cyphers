
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.html",
   "./node_modules/tw-elements/js/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily:{
        body: ['Parkinsans']
      },
      
    },
  },
  plugins: [require("tw-elements/plugin.cjs")],
  darkMode: "class"
}

