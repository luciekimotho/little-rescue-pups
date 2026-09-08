import { PUPS } from "./game.mjs";

const ink = "#344943";

export function svg(content, viewBox = "0 0 120 120", className = "") {
    return `<svg class="${className}" viewBox="${viewBox}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

export function icon(name, className = "") {
    const drawings = {
        paw: `<g fill="currentColor"><ellipse cx="60" cy="77" rx="29" ry="24"/><ellipse cx="27" cy="49" rx="13" ry="17" transform="rotate(-25 27 49)"/><ellipse cx="49" cy="30" rx="12" ry="17" transform="rotate(-8 49 30)"/><ellipse cx="76" cy="31" rx="12" ry="17" transform="rotate(10 76 31)"/><ellipse cx="97" cy="52" rx="12" ry="16" transform="rotate(28 97 52)"/></g>`,
        play: `<path d="M43 27 Q37 24 37 33 V87 Q37 96 45 91 L91 64 Q99 60 91 55Z" fill="currentColor"/>`,
        arrow: `<path d="M24 60H94M66 32L94 60 66 88" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
        sound: `<path d="M24 48H42L62 30V90L42 72H24Z" fill="currentColor"/><path d="M77 43Q95 60 77 77M89 29Q117 60 89 91" stroke="currentColor" fill="none" stroke-width="8" stroke-linecap="round"/>`,
        mute: `<path d="M19 48H37L57 30V90L37 72H19Z" fill="currentColor"/><path d="M77 45L103 75M103 45L77 75" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>`,
        parent: `<circle cx="46" cy="34" r="17" fill="currentColor"/><path d="M18 93V78Q18 56 46 56T74 78V93Z" fill="currentColor"/><circle cx="87" cy="62" r="12" fill="currentColor"/><path d="M70 97V88Q70 77 87 77T104 88V97Z" fill="currentColor"/>`,
        close: `<path d="M33 33L87 87M87 33L33 87" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>`,
        moon: `<path d="M86 91A42 42 0 0 1 48 17A39 39 0 0 0 86 91" fill="#ffcd6e"/>`,
        heart: `<path d="M60 99C18 75 8 48 28 30Q46 17 60 38Q77 16 96 31C118 53 94 81 60 99" fill="#e88c79"/>`,
        bridge: `<path d="M15 69Q60 38 105 69V85Q60 57 15 85Z" fill="#cf9756" stroke="#866746" stroke-width="5"/><path d="M23 74V40M97 74V40M23 47Q60 17 97 47" stroke="#866746" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M39 59V72M60 54V67M81 59V72" stroke="#f5d8a8" stroke-width="5"/>`,
        carrot: `<path d="M72 39Q22 40 27 101Q69 84 86 49Z" fill="#f39847" stroke="#b96630" stroke-width="4"/><path d="M72 37Q59 4 72 10L81 30Q96 1 103 16L87 38Q119 21 111 37L88 47" fill="#6c9e64"/><path d="M50 56L63 64M37 72L47 78" stroke="#d77b36" stroke-width="5" stroke-linecap="round"/>`,
        ladder: `<g stroke="#b57d48" stroke-width="13" stroke-linecap="round"><path d="M35 103L45 17M81 103L91 17"/></g><path d="M43 32H88M40 55H85M38 78H82" stroke="#dfac70" stroke-width="10" stroke-linecap="round"/>`,
        water: `<path d="M41 49Q14 21 14 62Q14 87 42 75" fill="none" stroke="#4d9389" stroke-width="10"/><path d="M69 63L99 39 108 51 79 86" fill="#80b8aa" stroke="#4d9389" stroke-width="4"/><path d="M34 47H76L81 91Q56 108 30 91Z" fill="#8dcabd" stroke="#4d9389" stroke-width="4"/><ellipse cx="55" cy="47" rx="21" ry="7" fill="#4d9389"/><path d="M101 29L115 47" stroke="#4d9389" stroke-width="9" stroke-linecap="round"/><path d="M105 65L101 73M113 60L111 70" stroke="#80b9d7" stroke-width="5" stroke-linecap="round"/>`,
        bucket: `<path d="M30 47Q30 0 62 12Q86 14 89 47" stroke="#bc8860" stroke-width="7" fill="none"/><path d="M22 44H98L87 99Q60 110 33 99Z" fill="#edb75f" stroke="#c58b3c" stroke-width="4"/><ellipse cx="60" cy="44" rx="38" ry="9" fill="#f7d798" stroke="#c58b3c" stroke-width="4"/><path d="M40 59L45 89" stroke="#ffe1a8" stroke-width="7" stroke-linecap="round"/>`,
    };
    return svg(drawings[name] || drawings.paw, "0 0 120 120", className);
}

function headgear(name, color) {
    if (name === "skye") {
        return `<path d="M56 61Q57 8 120 8Q183 8 184 61L158 51H82Z" fill="#e267a4"/>
            <path d="M65 40H176" stroke="#8c4875" stroke-width="10" stroke-linecap="round"/>
            <rect x="70" y="19" width="40" height="29" rx="12" fill="#c8e9f2" stroke="#f5b7d3" stroke-width="7"/>
            <rect x="131" y="19" width="40" height="29" rx="12" fill="#c8e9f2" stroke="#f5b7d3" stroke-width="7"/>
            <path d="M111 32H131" stroke="#f5b7d3" stroke-width="7"/>`;
    }
    if (name === "chase" || name === "rocky") {
        return `<path d="M64 49L70 18Q120 -3 171 18L177 49Z" fill="${color}"/>
            <path d="M61 49Q122 39 181 49L171 63Q120 56 71 63Z" fill="${name === "chase" ? "#163f82" : "#326b3d"}"/>
            <path d="M108 21H133V37L120 45 108 37Z" fill="#ffdb65"/>
            <circle cx="120" cy="30" r="4" fill="${color}"/>`;
    }
    return `<path d="M58 50Q59 3 120 3Q181 3 183 50Z" fill="${color}"/>
        <path d="M120 5V38" stroke="#ffffff" stroke-opacity=".45" stroke-width="10" stroke-linecap="round"/>
        <rect x="47" y="44" width="147" height="14" rx="7" fill="${color}"/>
        <path d="M106 23H134V45L120 53 106 45Z" fill="#ffefb1"/>
        <path d="M114 35L120 29 127 36 120 44Z" fill="${color}"/>`;
}

export function pup(name = "chase", pose = "happy") {
    const colors = {
        chase: { fur: "#bd874a", dark: "#70482f", light: "#ecc387" },
        marshall: { fur: "#fffaf0", dark: "#44454a", light: "#fffaf0" },
        skye: { fur: "#d0a272", dark: "#a9744d", light: "#f7dfb9" },
        rubble: { fur: "#bb8653", dark: "#805338", light: "#fff1d7" },
        rocky: { fur: "#a7adb1", dark: "#66747d", light: "#edf1e9" },
        zuma: { fur: "#926342", dark: "#5e3f31", light: "#bd946a" },
    };
    if (!PUPS[name]) throw new RangeError(`Unknown pup: ${name}`);
    const c = { ...colors[name], band: PUPS[name].color };
    const sleeping = pose === "sleep";
    const pointedEars = name === "chase" || name === "rocky";
    return `<ellipse cx="120" cy="232" rx="85" ry="11" fill="#314b3c" opacity=".10"/>
        <path d="M171 164Q235 131 212 107Q224 168 183 192" fill="${c.dark}"/>
        <ellipse cx="123" cy="175" rx="62" ry="52" fill="${c.fur}"/>
        <path d="M72 146Q121 163 173 146L185 191Q122 228 61 191Z" fill="${c.band}"/>
        <path d="M81 173L76 190M162 173L167 190" stroke="#ffffff" stroke-opacity=".65" stroke-width="7" stroke-linecap="round"/>
        <rect x="67" y="187" width="40" height="43" rx="19" fill="${c.fur}"/>
        <rect x="138" y="187" width="40" height="43" rx="19" fill="${c.fur}"/>
        <path d="M78 226V220M89 227V221M150 227V221M161 227V221" stroke="${c.dark}" stroke-width="3" stroke-linecap="round"/>
        ${pointedEars ? `<path d="M57 91Q29 59 42 5Q77 22 85 64M158 64Q166 22 199 5Q214 59 184 94" fill="${c.dark}"/><path d="M51 26L58 66 72 50M188 26L183 66 168 50" fill="#d4a184"/>` :
        `<path d="M64 54Q16 27 28 89Q30 140 59 143L81 95" fill="${c.dark}"/>
        <path d="M176 54Q224 27 212 89Q210 140 181 143L159 95" fill="${c.dark}"/>
        <path d="M46 67Q33 58 40 100Q43 119 51 118" fill="#dcac96" opacity=".7"/>
        <path d="M194 67Q207 58 200 100Q197 119 189 118" fill="#dcac96" opacity=".7"/>`}
        <rect x="52" y="35" width="136" height="122" rx="60" fill="${c.fur}"/>
        ${name === "chase" ? `<path d="M56 68Q79 34 120 35Q165 35 185 68L166 86 140 68 120 84 99 68 74 86Z" fill="${c.dark}"/>` : ""}
        ${name === "marshall" ? `<ellipse cx="68" cy="67" rx="10" ry="13" fill="${c.dark}"/><ellipse cx="166" cy="105" rx="9" ry="12" fill="${c.dark}"/><ellipse cx="152" cy="72" rx="7" ry="5" fill="${c.dark}"/><ellipse cx="81" cy="205" rx="6" ry="8" fill="${c.dark}"/><ellipse cx="151" cy="217" rx="7" ry="5" fill="${c.dark}"/>` : ""}
        ${["rubble", "rocky", "skye"].includes(name) ? `<path d="M106 36Q120 29 134 36L142 115H98Z" fill="${c.light}"/>` : ""}
        <ellipse cx="100" cy="120" rx="28" ry="24" fill="${c.light}"/>
        <ellipse cx="140" cy="120" rx="28" ry="24" fill="${c.light}"/>
        ${sleeping ? `<path d="M77 90Q87 99 98 90M143 90Q153 99 164 90" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>` :
        `<ellipse cx="88" cy="89" rx="8" ry="11" fill="${ink}"/><ellipse cx="152" cy="89" rx="8" ry="11" fill="${ink}"/><circle cx="85" cy="85" r="3" fill="white"/><circle cx="149" cy="85" r="3" fill="white"/>`}
        <path d="M109 113Q120 106 131 113Q133 121 120 125Q107 121 109 113" fill="${ink}"/>
        <path d="M120 124V130M120 130Q111 140 104 130M120 130Q129 140 136 130" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
        ${sleeping ? "" : `<path d="M113 136Q120 141 128 136V142Q120 157 113 142Z" fill="#e48f88"/>`}
        <ellipse cx="70" cy="112" rx="10" ry="6" fill="#e9a58b" opacity=".5"/><ellipse cx="170" cy="112" rx="10" ry="6" fill="#e9a58b" opacity=".5"/>
        <path d="M76 151Q120 168 165 151" fill="none" stroke="${c.band}" stroke-width="12" stroke-linecap="round"/>
        <path d="M109 162H137V181L123 192 109 181Z" fill="#ffdf75" stroke="#fff5cf" stroke-width="2"/>
        <path d="M118 175L123 181 131 169" fill="none" stroke="${c.band}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${headgear(name, c.band)}`;
}

export function crewArt(name) {
    return svg(pup(name), "15 -5 210 250", "crew-portrait");
}

function duck(x, y, scale = 1) {
    return `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cx="40" cy="52" rx="35" ry="25" fill="#f6c860"/><circle cx="62" cy="28" r="24" fill="#ffda7b"/><path d="M81 29L103 37 80 43" fill="#d98f43"/><circle cx="68" cy="25" r="4" fill="${ink}"/><path d="M17 47Q35 69 51 45" fill="#e9b449"/><path d="M26 77L18 81M48 77L58 81" stroke="#d98f43" stroke-width="5" stroke-linecap="round"/></g>`;
}

function bunny() {
    return `<ellipse cx="72" cy="141" rx="56" ry="42" fill="#ded4c7"/><ellipse cx="51" cy="40" rx="15" ry="42" transform="rotate(-14 51 40)" fill="#ded4c7"/><ellipse cx="90" cy="39" rx="15" ry="41" transform="rotate(8 90 39)" fill="#ded4c7"/><ellipse cx="51" cy="37" rx="7" ry="26" transform="rotate(-14 51 37)" fill="#e8b6aa"/><ellipse cx="90" cy="36" rx="7" ry="25" transform="rotate(8 90 36)" fill="#e8b6aa"/><circle cx="72" cy="86" r="42" fill="#eee5d9"/><circle cx="56" cy="81" r="5" fill="${ink}"/><circle cx="88" cy="81" r="5" fill="${ink}"/><path d="M66 94Q72 88 78 94L72 101Z" fill="#ce968b"/><path d="M72 102Q67 110 63 103M72 102Q77 110 82 103" fill="none" stroke="${ink}" stroke-width="2.5"/><circle cx="121" cy="145" r="17" fill="#fff7eb"/><ellipse cx="51" cy="174" rx="23" ry="12" fill="#eee5d9"/><ellipse cx="92" cy="174" rx="23" ry="12" fill="#eee5d9"/>`;
}

function kitten() {
    return `<path d="M88 99Q130 79 116 58" fill="none" stroke="#d58e64" stroke-width="15" stroke-linecap="round"/><ellipse cx="66" cy="97" rx="34" ry="38" fill="#eeb589"/><path d="M31 41L32 5 60 28 87 7 101 50" fill="#eeb589"/><path d="M38 32L39 17 53 31M77 31L85 18 91 38" fill="#da9486"/><ellipse cx="65" cy="50" rx="37" ry="32" fill="#f2c69e"/><ellipse cx="66" cy="104" rx="19" ry="24" fill="#f8e3c4"/><circle cx="50" cy="49" r="4.5" fill="${ink}"/><circle cx="80" cy="49" r="4.5" fill="${ink}"/><path d="M60 59L71 59 65 65Z" fill="#b67c72"/><path d="M65 65Q61 73 56 66M65 65Q70 73 75 66M43 62L20 58M44 69L23 74M86 62L110 57M86 69L110 73" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="45" cy="132" rx="16" ry="9" fill="#eeb589"/><ellipse cx="86" cy="132" rx="16" ry="9" fill="#eeb589"/>`;
}

function turtle() {
    return `<ellipse cx="42" cy="81" rx="14" ry="10" fill="#7eaa7b"/><ellipse cx="96" cy="81" rx="14" ry="10" fill="#7eaa7b"/><path d="M24 68L4 73 25 77" fill="#7eaa7b"/><path d="M22 70Q23 7 68 12Q116 15 119 70Z" fill="#629382"/><path d="M48 23L70 42 95 26M70 42L68 70M70 42L36 52M70 42L108 54" stroke="#487866" fill="none" stroke-width="4"/><rect x="19" y="66" width="101" height="13" rx="6" fill="#abc68a"/><ellipse cx="131" cy="62" rx="24" ry="20" fill="#a2c28b"/><circle cx="140" cy="56" r="4" fill="${ink}"/><path d="M140 70Q147 71 150 66" stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
}

function flower(x, y, color = "#edaa91", open = true) {
    return `<g transform="translate(${x} ${y})"><path d="M0 0V62M0 43Q-29 15 -27 39Q-14 52 0 48M0 31Q28 8 25 31Q14 42 0 39" stroke="#6d9773" stroke-width="5" fill="#86a981" stroke-linecap="round"/>
    ${open ? `<g fill="${color}"><ellipse cy="-14" rx="13" ry="17"/><ellipse cx="17" cy="-3" rx="17" ry="13" transform="rotate(25 17 -3)"/><ellipse cx="10" cy="16" rx="13" ry="17" transform="rotate(-30 10 16)"/><ellipse cx="-12" cy="15" rx="13" ry="17" transform="rotate(30 -12 15)"/><ellipse cx="-17" cy="-5" rx="17" ry="13"/></g><circle r="12" fill="#ffe19a"/>` : `<ellipse cy="-6" rx="12" ry="18" fill="#87a97f"/>`}</g>`;
}

const cloud = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fffdf5" opacity=".86"><rect y="20" width="118" height="29" rx="15"/><ellipse cx="39" cy="25" rx="28" ry="24"/><ellipse cx="73" cy="17" rx="29" ry="28"/></g>`;

function backdrop(beach = false) {
    return `<rect width="1000" height="500" fill="${beach ? "#d6f0fa" : "#dceffb"}"/>
        <circle cx="838" cy="85" r="43" fill="#f7d68b"/><circle cx="838" cy="85" r="57" fill="#f7d68b" opacity=".2"/>
        ${cloud(95, 57, .9)}${cloud(527, 44, .7)}${cloud(900, 138, .75)}
        <path d="M0 258Q150 155 336 260Q495 157 693 257Q859 185 1000 258V500H0Z" fill="${beach ? "#a7d0d1" : "#c3d7b9"}"/>
        <path d="M0 300Q250 221 496 314Q728 222 1000 293V500H0Z" fill="${beach ? "#eedab2" : "#adc9a6"}"/>
        <path d="M0 403Q332 333 594 403Q818 335 1000 387V500H0Z" fill="${beach ? "#f6e6c9" : "#d4dfb8"}"/>
        <path d="M0 483Q371 378 651 431T1000 467V500H0Z" fill="${beach ? "#f8ecd5" : "#e9e0bd"}"/>
        ${beach ? "" : `<g stroke="#8eae88" stroke-width="3" stroke-linecap="round"><path d="M76 351L70 341M76 351L82 337M405 416L398 406M405 416L410 401M883 380L878 370M883 380L890 365"/></g>`}`;
}

export function welcomeArt(sleep = false) {
    return svg(`${backdrop()}
        <path d="M463 281L474 118H538L550 281Z" fill="#d7e2ea" stroke="#b6cbd9" stroke-width="5"/>
        <path d="M483 279L493 133H517L529 279Z" fill="#4895d2"/>
        <rect x="441" y="79" width="131" height="65" rx="21" fill="#68b8db" stroke="#eef8fc" stroke-width="7"/>
        <path d="M471 85V135M540 85V135" stroke="#e5f5fd" stroke-width="6"/>
        <path d="M426 82Q507 20 586 82Z" fill="#e65448"/><rect x="428" y="79" width="157" height="13" rx="6" fill="#bd3f37"/>
        <path d="M573 131Q713 212 658 309" fill="none" stroke="#f4c543" stroke-width="22" stroke-linecap="round"/>
        <path d="M506 37V19" stroke="#64859c" stroke-width="5"/><circle cx="506" cy="14" r="7" fill="#e65448"/>
        <g transform="translate(180 200) rotate(-5 120 200) scale(.88)">${pup("marshall", sleep ? "sleep" : "happy")}</g>
        <g transform="translate(580 192) rotate(5 120 200) scale(.90)">${pup("skye", sleep ? "sleep" : "happy")}</g>
        <g transform="translate(352 153) scale(1.2)">${pup("chase", sleep ? "sleep" : "happy")}</g>
        ${flower(126, 373, "#e7a18d")}${flower(860, 386, "#f2c469")}${flower(904, 414, "#e7a18d")}
        ${sleep ? `<g fill="#708b83" font-family="sans-serif" font-size="29" font-weight="700"><text x="305" y="217">z</text><text x="726" y="184">z</text><text x="551" y="146">z</text></g>` : ""}
        <ellipse cx="295" cy="479" rx="8" ry="4" fill="#c4b594"/><ellipse cx="740" cy="468" rx="12" ry="5" fill="#c4b594"/>`, "0 0 1000 500", "landscape");
}

export function sceneArt(mission, step) {
    const success = step === 3;
    let scene = "";
    if (mission.id === "ducks") {
        scene = `<ellipse cx="636" cy="383" rx="220" ry="59" fill="#91c1c4"/><path d="M444 392Q510 401 534 390M732 411Q773 420 805 409" stroke="#d5eae3" stroke-width="5" fill="none" stroke-linecap="round"/>
            <path d="M473 367Q636 295 803 368" stroke="#997249" stroke-width="7" fill="none"/><path d="M473 384V335M803 384V335" stroke="#997249" stroke-width="10" stroke-linecap="round"/>
            <defs><clipPath id="bridge-progress"><rect x="472" y="305" width="${step * 111}" height="100"/></clipPath></defs>
            <g clip-path="url(#bridge-progress)"><path d="M473 378Q638 304 803 378V394Q638 320 473 394Z" fill="#cc9c64" stroke="#a98050" stroke-width="3"/><path d="M583 345V362M693 345V362" stroke="#a98050" stroke-width="3"/></g>
            ${duck(success ? 802 : 373, success ? 302 : 303, .76)}
            ${duck(success ? 758 : 322, success ? 319 : 324, .51)}
            ${duck(success ? 870 : 398, success ? 335 : 358, .46)}
            <g stroke="#729b85" stroke-width="5" stroke-linecap="round"><path d="M892 404V365M902 409V375M429 428V400"/></g>`;
    } else if (mission.id === "bunny") {
        scene = `<ellipse cx="701" cy="403" rx="139" ry="27" fill="#9cb38b"/><g transform="translate(644 228)">${bunny()}</g>
            <ellipse cx="569" cy="403" rx="69" ry="21" fill="#b88461"/><ellipse cx="569" cy="397" rx="65" ry="17" fill="#d2ae86"/>
            ${Array.from({ length: step }, (_, i) => `<g transform="translate(${515 + i * 23} ${337 - i * 6}) scale(.6)">${icon("carrot").replace(/<\/?svg[^>]*>/g, "")}</g>`).join("")}
            ${flower(827, 363, "#eee7bb")}${flower(428, 356, "#eee7bb")}`;
    } else if (mission.id === "kitten") {
        scene = `<path d="M706 363Q694 223 704 142L744 139Q731 269 758 367Z" fill="#b1916d"/>
            <path d="M722 260L811 206M720 233L651 192" stroke="#b1916d" stroke-width="21" stroke-linecap="round"/>
            <g fill="#94b396"><circle cx="641" cy="132" r="68"/><circle cx="727" cy="95" r="83"/><circle cx="802" cy="138" r="65"/><circle cx="735" cy="164" r="70"/></g>
            <g fill="#aec5a1"><circle cx="652" cy="111" r="42"/><circle cx="728" cy="78" r="51"/></g>
            <path d="M611 389L640 244M678 389L696 244" stroke="#b6814d" stroke-width="12" stroke-linecap="round"/>
            ${Array.from({ length: step }, (_, i) => `<path d="M${619 + i * 9} ${356 - i * 43}H${683 + i * 5}" stroke="#e1b477" stroke-width="12" stroke-linecap="round"/>`).join("")}
            <g transform="translate(${success ? 786 : 591} ${success ? 284 : 133}) scale(.82)">${kitten()}</g>`;
    } else if (mission.id === "flowers") {
        scene = `<ellipse cx="668" cy="409" rx="216" ry="32" fill="#b99474"/>
            ${[0, 1, 2].map(i => flower(518 + i * 151, 284 + (i % 2 ? -24 : 16), ["#edaa91", "#f4cd77", "#c2aed1"][i], step > i)).join("")}
            <path d="M481 411Q659 436 844 412" stroke="#d6b596" stroke-width="8" fill="none" stroke-linecap="round"/>
            ${step ? `<g fill="#87b9c6" opacity=".6"><ellipse cx="${496 + (step - 1) * 150}" cy="221" rx="4" ry="7"/><ellipse cx="${519 + (step - 1) * 150}" cy="211" rx="4" ry="7"/><ellipse cx="${540 + (step - 1) * 150}" cy="225" rx="4" ry="7"/></g>` : ""}`;
    } else {
        scene = `<path d="M813 244Q758 327 839 375Q904 419 822 500H1000V246Z" fill="#a1ced0"/><path d="M823 255Q770 327 850 374Q918 424 837 500" fill="none" stroke="#edf4e9" stroke-width="12"/>
            ${Array.from({ length: 3 - step }, (_, i) => `<path d="M${558 + i * 76} 379Q${592 + i * 76} 288 ${636 + i * 76} 379" fill="#dbbb85"/><path d="M${575 + i * 76} 350L${592 + i * 76} 336" stroke="#f1d5a4" stroke-width="5" stroke-linecap="round"/>`).join("")}
            <g transform="translate(${success ? 818 : 413 + step * 82} ${success ? 335 : 307}) scale(.82)">${turtle()}</g>
            <path d="M732 435L714 410Q733 390 751 410Z" fill="#e4b49c" stroke="#cc9f86" stroke-width="2"/><path d="M732 435L725 411M732 435L739 410" stroke="#cc9f86" stroke-width="2"/>`;
    }
    return svg(`${backdrop(mission.id === "turtle")}
        <g transform="translate(66 195) scale(.85)">${pup(mission.pup)}</g>
        ${mission.buddy ? `<g transform="translate(22 321) scale(.59)">${pup(mission.buddy)}</g>` : ""}
        ${scene}${success ? `<g fill="#faf4cb" stroke="#d0b776" stroke-width="2"><path d="M361 138L368 157 387 164 368 171 361 190 354 171 335 164 354 157Z"/><path d="M885 232L890 245 904 250 890 255 885 268 880 255 866 250 880 245Z"/></g>` : ""}`, "0 0 1000 500", "landscape");
}
