<script lang="ts">
    import { UI_ICON_PATHS, type UiIconName } from "./icons";

    let { name = "folder", size = 18, className = "", label }: {
        name?: UiIconName;
        size?: number;
        className?: string;
        label?: string;
    } = $props();

    const path = $derived(UI_ICON_PATHS[name] ?? UI_ICON_PATHS.folder);
</script>

<svg class={`lv-ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24"
    style={`display:block;flex:none;width:${size}px!important;height:${size}px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round`}
    fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden={label ? undefined : "true"} aria-label={label} role={label ? "img" : undefined} focusable="false">
    <path d={path}></path>
</svg>

<style>
    :global(.lv-ui-icon) {
        display: block;
        flex: none;
        fill: none !important;
        stroke: currentColor !important;
    }

    :global(.lv-ui-icon path) {
        fill: none !important;
        stroke: currentColor !important;
    }
</style>

