import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import './style.css'
import App from './App.vue'

const vuetify = createVuetify({
	theme: {
		defaultTheme: 'superPomodoroLight',
		themes: {
			superPomodoroLight: {
				dark: false,
				colors: {
					primary: '#305f4d',
					secondary: '#e7b65d',
					surface: '#fff8ed',
					background: '#f6efe2',
					success: '#46785f',
				},
			},
			superPomodoroDark: {
				dark: true,
				colors: {
					primary: '#7ad6a6',
					secondary: '#f2c46b',
					surface: '#111827',
					background: '#0f1722',
					success: '#5bc38c',
				},
			},
		},
	},
})

createApp(App).use(vuetify).mount('#app')
