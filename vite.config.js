import { defineConfig } from 'vite';

export default defineConfig( {
	// relative asset paths: the build runs from any sub-path (GitHub Pages serves it under /tidewater/)
	base: './',
	build: {
		target: 'esnext',
		chunkSizeWarningLimit: 4000,
		rollupOptions: {
			output: {
				manualChunks( id ) {

					const n = id.replace( /\\/g, '/' );
					if ( n.includes( '/src/engine/' ) ) return 'engine';
					if ( n.includes( '/src/ocean/' ) ) return 'ocean';
					if ( n.includes( '/src/world/' ) ) return 'world';
					if ( n.includes( '/src/ui/' ) || n.includes( '/src/audio/' ) || n.includes( '/src/i18n/' ) ) return 'ui-audio';

				},
			},
		},
	},
	server: { port: 5189, strictPort: true, host: '127.0.0.1' },
} );
