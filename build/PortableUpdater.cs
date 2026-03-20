using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

internal static class PortableUpdater
{
    private static string _logPath = string.Empty;

    private static int Main(string[] args)
    {
        try
        {
            var options = ParseArgs(args);

            var targetExe = Require(options, "--targetExe");
            var downloadedExe = Require(options, "--downloadedExe");
            var parentPid = int.Parse(Require(options, "--parentPid"));
            _logPath = Require(options, "--logPath");
            var argsBase64 = options.ContainsKey("--argsBase64") ? options["--argsBase64"] : string.Empty;

            WriteLog("Portable updater started");
            WriteLog("Target exe: " + targetExe);
            WriteLog("Downloaded exe: " + downloadedExe);
            WriteLog("Parent pid: " + parentPid);

            var appArgs = DecodeArgs(argsBase64);

            WaitForProcessExit(parentPid, 120);
            WaitForFileAvailable(targetExe, 120);

            var backupExe = targetExe + ".bak";
            if (File.Exists(backupExe))
            {
                WriteLog("Removing stale backup: " + backupExe);
                File.Delete(backupExe);
            }

            WriteLog("Backing up current executable");
            File.Move(targetExe, backupExe);

            try
            {
                WriteLog("Replacing executable");
                File.Move(downloadedExe, targetExe);
            }
            catch (Exception replaceError)
            {
                WriteLog("Replace failed: " + replaceError.Message);
                if (File.Exists(backupExe) && !File.Exists(targetExe))
                {
                    File.Move(backupExe, targetExe);
                }
                throw;
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = targetExe,
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(targetExe) ?? Environment.CurrentDirectory,
                Arguments = BuildArgumentString(appArgs)
            };

            WriteLog("Launching updated executable");
            Process.Start(startInfo);

            if (File.Exists(backupExe))
            {
                WriteLog("Removing backup file");
                File.Delete(backupExe);
            }

            WriteLog("Portable update completed successfully");
            return 0;
        }
        catch (Exception ex)
        {
            WriteLog("Portable update failed: " + ex);
            return 1;
        }
    }

    private static Dictionary<string, string> ParseArgs(string[] args)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < args.Length; i++)
        {
            var key = args[i];
            if (!key.StartsWith("--", StringComparison.Ordinal))
            {
                continue;
            }

            var value = i + 1 < args.Length ? args[i + 1] : string.Empty;
            if (value.StartsWith("--", StringComparison.Ordinal))
            {
                result[key] = string.Empty;
                continue;
            }

            result[key] = value;
            i++;
        }

        return result;
    }

    private static string Require(Dictionary<string, string> options, string key)
    {
        if (!options.ContainsKey(key) || string.IsNullOrWhiteSpace(options[key]))
        {
            throw new InvalidOperationException("Missing required argument: " + key);
        }

        return options[key];
    }

    private static string[] DecodeArgs(string argsBase64)
    {
        if (string.IsNullOrWhiteSpace(argsBase64))
        {
            return Array.Empty<string>();
        }

        var raw = Encoding.UTF8.GetString(Convert.FromBase64String(argsBase64));
        return raw.Split(new[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
    }

    private static void WaitForProcessExit(int pid, int timeoutSeconds)
    {
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);

        while (DateTime.UtcNow < deadline)
        {
            try
            {
                using (var process = Process.GetProcessById(pid))
                {
                    if (process.HasExited)
                    {
                        WriteLog("Parent process exited");
                        return;
                    }
                }
            }
            catch (ArgumentException)
            {
                WriteLog("Parent process already exited");
                return;
            }

            Thread.Sleep(500);
        }

        throw new TimeoutException("Timed out waiting for process exit: " + pid);
    }

    private static void WaitForFileAvailable(string filePath, int timeoutSeconds)
    {
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);

        while (DateTime.UtcNow < deadline)
        {
            try
            {
                using (File.Open(filePath, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                {
                    WriteLog("Target executable is no longer locked");
                    return;
                }
            }
            catch (IOException)
            {
                Thread.Sleep(500);
            }
            catch (UnauthorizedAccessException)
            {
                Thread.Sleep(500);
            }
        }

        throw new TimeoutException("Timed out waiting for target executable to become writable: " + filePath);
    }

    private static void WriteLog(string message)
    {
        if (string.IsNullOrWhiteSpace(_logPath))
        {
            return;
        }

        try
        {
            var directory = Path.GetDirectoryName(_logPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.AppendAllText(
                _logPath,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + message + Environment.NewLine,
                Encoding.UTF8
            );
        }
        catch
        {
            // Best effort logging only.
        }
    }

    private static string BuildArgumentString(IEnumerable<string> args)
    {
        var builder = new StringBuilder();

        foreach (var arg in args)
        {
            if (builder.Length > 0)
            {
                builder.Append(' ');
            }

            builder.Append(QuoteArgument(arg));
        }

        return builder.ToString();
    }

    private static string QuoteArgument(string arg)
    {
        if (string.IsNullOrEmpty(arg))
        {
            return "\"\"";
        }

        if (arg.IndexOfAny(new[] { ' ', '\t', '"' }) < 0)
        {
            return arg;
        }

        return "\"" + arg.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
