import browser from 'webextension-polyfill';

export const ext = {
    bookmarks: {
        getTree: () => browser.bookmarks.getTree(),
        get: (id: string) => browser.bookmarks.get(id),
        create: (bookmark: browser.Bookmarks.CreateDetails) => browser.bookmarks.create(bookmark),
        update: (id: string, changes: browser.Bookmarks.UpdateChangesType) => browser.bookmarks.update(id, changes),
        remove: (id: string) => browser.bookmarks.remove(id),
        move: (id: string, destination: browser.Bookmarks.MoveDestinationType) => browser.bookmarks.move(id, destination),
        onCreated: browser.bookmarks.onCreated,
        onRemoved: browser.bookmarks.onRemoved,
        onChanged: browser.bookmarks.onChanged,
        onMoved: browser.bookmarks.onMoved
    },
    storage: {
        local: {
            get: (keys?: string | string[] | null) => browser.storage.local.get(keys),
            set: (items: Record<string, any>) => browser.storage.local.set(items),
            clear: () => browser.storage.local.clear()
        }
    },
    runtime: {
        getPlatformInfo: () => browser.runtime.getPlatformInfo(),
        sendMessage: (message: any) => browser.runtime.sendMessage(message),
        onMessage: browser.runtime.onMessage,
        getURL: (path: string) => browser.runtime.getURL(path)
    },
    tabs: {
        create: (createProperties: browser.Tabs.CreateCreatePropertiesType) => browser.tabs.create(createProperties),
        query: (queryInfo: browser.Tabs.QueryQueryInfoType) => browser.tabs.query(queryInfo)
    },
    notifications: {
        create: (notificationId: string, options: browser.Notifications.CreateNotificationOptions) => 
            browser.notifications.create(notificationId, options),
        clear: (notificationId: string) => browser.notifications.clear(notificationId)
    },
    alarms: {
        create: (name: string, alarmInfo: browser.Alarms.CreateAlarmInfoType) => browser.alarms.create(name, alarmInfo),
        clear: (name: string) => browser.alarms.clear(name),
        onAlarm: browser.alarms.onAlarm
    }
};

export type { browser as Browser };
export default ext;
