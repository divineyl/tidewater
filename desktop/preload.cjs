'use strict';

const { contextBridge, ipcRenderer } = require( 'electron' );

contextBridge.exposeInMainWorld( 'tidewaterDesktop', {
	isDesktop: true,
	startLanHost: ( port ) => ipcRenderer.invoke( 'lan:start', port ),
	stopLanHost: () => ipcRenderer.invoke( 'lan:stop' ),
	getLanInfo: () => ipcRenderer.invoke( 'lan:info' ),
	createDesktopShortcut: () => ipcRenderer.invoke( 'desktop:createShortcut' ),
} );
