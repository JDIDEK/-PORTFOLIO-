export interface TerminalOptions {
  canPlayCrashTypingSound?: () => boolean;
}

export function initInteractiveTerminal(options: TerminalOptions = {}): void {
  const { canPlayCrashTypingSound = () => false } = options;

  const openTermBtn = document.getElementById('open-terminal');
  const terminalModal = document.getElementById('terminal-modal');
  const closeTermBtn = document.getElementById('close-terminal');
  const termInput = document.getElementById('terminal-input') as HTMLInputElement;
  const termHistory = document.getElementById('terminal-history');
  const termBody = document.getElementById('terminal-body');
  const termHeader = document.querySelector('.terminal-header') as HTMLElement;
  const termWindow = document.querySelector('.terminal-window') as HTMLElement;

  if (
    !openTermBtn ||
    !terminalModal ||
    !closeTermBtn ||
    !termInput ||
    !termHistory ||
    !termBody ||
    !termHeader ||
    !termWindow
  ) {
    return;
  }

  const terminalModalEl = terminalModal;

  const cmdHistory: string[] = [];
  let historyIndex = -1;
  const terminalIntervals: number[] = [];
  let neofetchCallCount = 0;
  const asciiFrameUrls = Array.from({ length: 51 }, (_, index) => {
    return `/assets/frames/frame_${String(index + 1).padStart(3, '0')}.txt`;
  });
  let cachedAsciiFrames: string[] | null = null;
  let asciiFramesLoadingPromise: Promise<string[]> | null = null;

  const loadAsciiFrames = async (): Promise<string[]> => {
    if (cachedAsciiFrames) return cachedAsciiFrames;
    if (asciiFramesLoadingPromise) return asciiFramesLoadingPromise;

    asciiFramesLoadingPromise = Promise.all(
      asciiFrameUrls.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Unable to load ASCII frame: ${url}`);
        }
        return (await response.text()).replace(/\r\n/g, '\n');
      })
    )
      .then((frames) => {
        cachedAsciiFrames = frames;
        return frames;
      })
      .catch((error) => {
        console.error(error);
        return [];
      })
      .finally(() => {
        asciiFramesLoadingPromise = null;
      });

    return asciiFramesLoadingPromise;
  };

  const knownCommands = ['help', 'ls', 'clear', 'whoami', 'sudo', 'cd', 'cat', 'neofetch', 'rm'];
  const knownFiles = ['about/', 'works/', 'contact.txt', 'matrix.sh'];

  openTermBtn.addEventListener('click', () => {
    terminalModalEl.classList.add('active');
    setTimeout(() => termInput.focus(), 100);
  });

  const closeModal = () => {
    terminalModalEl.classList.remove('active');
    terminalIntervals.forEach(clearInterval);
    terminalIntervals.length = 0;
  };
  closeTermBtn.addEventListener('click', closeModal);

  termBody.addEventListener('click', () => termInput.focus());

  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  termHeader.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).id === 'close-terminal') return;
    isDragging = true;
    const rect = termWindow.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    termWindow.style.transform = 'none';
    termWindow.style.left = `${rect.left}px`;
    termWindow.style.top = `${rect.top}px`;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    termWindow.style.left = `${e.clientX - dragOffsetX}px`;
    termWindow.style.top = `${e.clientY - dragOffsetY}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const inputVal = termInput.value;
      const args = inputVal.split(' ');

      if (args.length === 1) {
        const match = knownCommands.find((c) => c.startsWith(args[0].toLowerCase()));
        if (match) termInput.value = `${match} `;
      } else if (args.length === 2 && ['cd', 'cat', 'rm'].includes(args[0].toLowerCase())) {
        const match = knownFiles.find((f) => f.startsWith(args[1].toLowerCase()));
        if (match) termInput.value = `${args[0]} ${match}`;
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        termInput.value = cmdHistory[historyIndex];
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < cmdHistory.length - 1) {
        historyIndex++;
        termInput.value = cmdHistory[historyIndex];
      } else {
        historyIndex = cmdHistory.length;
        termInput.value = '';
      }
      return;
    }

    if (e.key === 'Enter') {
      const cmdText = termInput.value.trim();

      if (cmdText) {
        cmdHistory.push(cmdText);
        historyIndex = cmdHistory.length;
        executeCommand(cmdText);
      } else {
        printLog(
          '<div class="cmd-echo"><span class="term-user">root@josselin</span>:<span class="term-path">~</span>#</div>'
        );
      }
      termInput.value = '';
    }
  });

  function printLog(html: string) {
    const p = document.createElement('div');
    p.innerHTML = html;
    termHistory.appendChild(p);
    termBody.scrollTop = termBody.scrollHeight;
  }

  function executeCommand(cmdText: string) {
    printLog(
      `<div class="cmd-echo"><span class="term-user">root@josselin</span>:<span class="term-path">~</span># ${cmdText}</div>`
    );

    const args = cmdText.split(/\s+/).filter(Boolean);
    const cmd = args[0];
    const extraArgs = args.slice(1);

    switch (cmd) {
      case 'help':
        printLog(`Available commands:
        <br/>- <span class="t-warn">ls</span> : List directory contents
        <br/>- <span class="t-warn">cd [dir]</span> : Change directory
        <br/>- <span class="t-warn">whoami</span> : Print effective user id
        <br/>- <span class="t-warn">clear</span> : Clear terminal screen
        <br/>- <span class="t-warn">cat [file]</span> : Concatenate files and print
        <br/>- <span class="t-warn">neofetch</span> : Print system information`);
        break;

      case 'ls':
        if (extraArgs.length > 0) {
          printLog(`<span class="t-err">ls: cannot access '${extraArgs[0]}': No such file or directory</span>`);
        } else {
          printLog(
            '<span class="t-blue">about</span>&nbsp;&nbsp;&nbsp;<span class="t-blue">works</span>&nbsp;</span>&nbsp;&nbsp;&nbsp;contact.txt&nbsp;&nbsp;&nbsp;<span class="t-green">matrix.sh*</span>'
          );
        }
        break;

      case 'clear':
        termHistory.innerHTML = '';
        break;

      case 'whoami':
        if (extraArgs.length > 0) {
          printLog(`whoami: extra operand '${extraArgs[0]}'<br/>Try 'whoami --help' for more information.`);
        } else {
          printLog('root');
        }
        break;

      case 'sudo':
        printLog(
          'root@josselin is not in the sudoers file.<br/><span class="t-err">This incident will be reported.</span>'
        );
        break;

      case 'cd':
        if (extraArgs.length === 0) {
          printLog('');
        } else if (extraArgs.length > 1) {
          printLog('<span class="t-err">bash: cd: too many arguments</span>');
        } else {
          const target = extraArgs[0].replace(/\/$/, '');
          if (['about', 'works'].includes(target)) {
            printLog(`Navigating to <span class="t-blue">${target}</span>...`);
            setTimeout(() => {
              closeModal();
            }, 800);
          } else {
            printLog(`<span class="t-err">bash: cd: ${target}: No such file or directory</span>`);
          }
        }
        break;

      case 'cat':
        if (extraArgs.length === 0) {
          printLog('<span class="t-err">cat: missing operand</span><br/>Try \'cat --help\' for more information.');
        } else {
          const file = extraArgs[0];
          if (file === 'contact.txt') {
            printLog('Email: contact@didev.fr<br/>Github: https://github.com/JDIDEK');
          } else if (file === 'matrix.sh') {
            printLog('<span class="t-err">bash: ./matrix.sh: Permission denied.</span>');
          } else {
            printLog(`<span class="t-err">cat: ${file}: No such file or directory</span>`);
          }
        }
        break;

      case 'neofetch': {
        neofetchCallCount++;
        const animId = `ascii-anim-${neofetchCallCount}`;

        printLog(`
          <div style="display: flex; gap: 25px; align-items: center; margin-top: 15px; margin-bottom: 15px;">
            <div id="${animId}" style="color: #ff0000; white-space: pre; font-family: monospace; font-weight: bold; text-shadow: 0 0 8px rgba(255,0,0,0.7); font-size: 1.1em; line-height: 1.1; min-height: 120px; min-width: 200px;"></div>
            <div>
              -------------------<br/>
              <span class="t-blue">OS</span>: Josselin_OS (Cyberpunk Kernel)<br/>
              <span class="t-blue">Net</span>: LINK_ESTABLISHED // SECURE<br/>
              <span class="t-blue">Role</span>: Creative Developer & Breaker<br/>
              <span class="t-blue">Status</span>: <span class="t-green" style="text-shadow: 0 0 5px #8ae234;">System Stable (mostly)</span><br/>
              <span class="t-blue">Shell</span>: bash v5.0 (infected)<br/>
            </div>
          </div>
        `);

        setTimeout(() => {
          const animTarget = document.getElementById(animId);
          if (animTarget) {
            void loadAsciiFrames().then((frames) => {
              if (!frames.length) {
                animTarget.textContent = '\n[ASCII animation unavailable]\n';
                termBody.scrollTop = termBody.scrollHeight;
                return;
              }

              let frameIndex = 0;
              animTarget.textContent = `\n${frames[frameIndex]}\n`;
              termBody.scrollTop = termBody.scrollHeight;

              const interval = setInterval(() => {
                if (!terminalModalEl.classList.contains('active')) {
                  clearInterval(interval);
                  return;
                }
                frameIndex = (frameIndex + 1) % frames.length;
                animTarget.textContent = `\n${frames[frameIndex]}\n`;
                termBody.scrollTop = termBody.scrollHeight;
              }, 80) as unknown as number;

              terminalIntervals.push(interval);
            });
          }
        }, 50);
        break;
      }

      case 'rm':
        if (extraArgs.join(' ') === '-rf /' || extraArgs.join(' ') === '-rf /*') {
          termInput.disabled = true;
          termInput.value = '';
          termInput.placeholder = 'SYSTEM CORRUPTED...';

          let delay = 20;
          let count = 0;
          const fakeFiles = [
            '/boot/vmlinuz-linux',
            '/etc/fstab',
            '/usr/bin/sudo',
            '/usr/lib/systemd',
            '/var/log/syslog',
            '/dev/sda1',
            '/usr/local/bin/node',
            '/home/josselin/portfolio/index.html',
            '/sys/firmware/efi',
            '/dev/null',
            '...'
          ];

          const keyboardSound = new Audio('/assets/sounds/keyboard.mp3');

          const nukeSystem = () => {
            if (count < 25) {
              const file = fakeFiles[count % fakeFiles.length];
              printLog(`rm: cannot remove '${file}': Device or resource busy`);
              if (count > 5) printLog(`rm: removing directory '${file}'`);

              delay += 15;
              count++;
              setTimeout(nukeSystem, delay);
            } else {
              printLog(
                '<br/><span class="t-err" style="font-size: 1.1em; font-weight: bold;">Segmentation fault (core dumped)</span>'
              );
              printLog('<span class="t-warn">Kernel panic - not syncing: Attempted to kill init!</span>');

              termWindow.style.animation = 'neon-heavy-flicker 0.2s infinite';

              setTimeout(() => {
                document.body.innerHTML = `
                  <div style="background:#000; color:#ccc; width:100vw; height:100vh; display:flex; flex-direction:column; padding: 20px; font-family: 'Courier New', monospace; box-sizing: border-box; margin: 0;">
                    <p>GRUB loading.</p>
                    <p>Welcome to GRUB!</p>
                    <p style="color: #ff0000; margin-top: 20px;">error: no such partition.</p>
                    <p style="color: #ff0000;">Entering rescue mode...</p>
                    <div style="display: flex; align-items: center; margin-top: 10px;">
                      <span>grub rescue> </span>
                      <span id="grub-text" style="margin-left: 8px;"></span>
                      <span class="term-cursor" style="color: #fff; margin-left: 2px;">_</span>
                    </div>
                  </div>
                `;

                const message =
                  'Fatal error. File system destroyed. Please refresh the page to reboot.';
                const grubTextEl = document.getElementById('grub-text');
                let charIndex = 0;

                const typeWriter = () => {
                  if (charIndex < message.length) {
                    if (grubTextEl) {
                      grubTextEl.textContent += message.charAt(charIndex);
                    }

                    if (canPlayCrashTypingSound()) {
                      const click = keyboardSound.cloneNode() as HTMLAudioElement;
                      click.volume = 0.3 + Math.random() * 0.2;
                      click.play().catch(() => {});
                    }

                    charIndex++;
                    setTimeout(typeWriter, Math.random() * 100 + 50);
                  }
                };

                setTimeout(typeWriter, 1500);
              }, 2500);
            }
          };

          nukeSystem();
        } else {
          printLog(`rm: cannot remove '${extraArgs.join(' ')}': Permission denied`);
        }
        break;

      default:
        printLog(`<span class="t-err">bash: ${cmd}: command not found</span>`);
    }
  }
}
