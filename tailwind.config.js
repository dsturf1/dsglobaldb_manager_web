/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./node_modules/@aws-amplify/ui-react/**/*.{js,ts,jsx,tsx}", // Amplify UI 추가
  ],
  theme: {
    extend: {},
  },
  optimizeDeps: {
    include: ['aws-amplify'],
  },
  plugins: [require("daisyui")],
};



// module.exports = {
//   content: ["./src/**/*.{js,jsx,ts,tsx}"],
//   theme: {
//     extend: {},
//   },
//   plugins: [require("daisyui")],
// };