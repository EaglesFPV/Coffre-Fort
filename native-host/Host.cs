using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

internal static class Program
{
    private const int MaxFrameLength = 1024 * 1024;
    private const int ConnectTimeoutMs = 500;
    private const string PipePrefix = "coffre-fort-browser-";
    private const string AppExecutable = "Coffre-Fort.exe";

    private static int Main(string[] args)
    {
        string origin = args.Length > 0 ? args[0] : "";
        Stream input = Console.OpenStandardInput();
        Stream output = Console.OpenStandardOutput();

        NamedPipeClientStream pipe = Connect();
        if (pipe == null)
        {
            ServeOffline(input, output);
            return 0;
        }

        WriteFrame(pipe, Encoding.UTF8.GetBytes("{\"type\":\"hello\",\"origin\":" + JsonString(origin) + "}"));

        Thread toBrowser = new Thread(delegate()
        {
            Pump(pipe, output);
            Environment.Exit(0);
        });
        toBrowser.IsBackground = true;
        toBrowser.Start();

        Pump(input, pipe);
        return 0;
    }

    private static string PipeName()
    {
        byte[] user = Encoding.UTF8.GetBytes(Environment.UserName);
        return PipePrefix + BitConverter.ToString(user).Replace("-", "").ToLowerInvariant();
    }

    private static NamedPipeClientStream Connect()
    {
        NamedPipeClientStream pipe = new NamedPipeClientStream(".", PipeName(), PipeDirection.InOut, PipeOptions.Asynchronous);
        try
        {
            pipe.Connect(ConnectTimeoutMs);
            return pipe;
        }
        catch (Exception)
        {
            pipe.Dispose();
            return null;
        }
    }

    private static void Pump(Stream source, Stream destination)
    {
        try
        {
            while (true)
            {
                byte[] frame = ReadFrame(source);
                if (frame == null) return;
                WriteFrame(destination, frame);
            }
        }
        catch (Exception)
        {
            return;
        }
    }

    private static void ServeOffline(Stream input, Stream output)
    {
        try
        {
            while (true)
            {
                byte[] frame = ReadFrame(input);
                if (frame == null) return;
                string text = Encoding.UTF8.GetString(frame);
                Match id = Regex.Match(text, "\"id\"\\s*:\\s*(\\d{1,15})");
                string idJson = id.Success ? id.Groups[1].Value : "0";
                bool launch = Regex.IsMatch(text, "\"type\"\\s*:\\s*\"launch\"");
                string reply = launch && LaunchApp()
                    ? "{\"id\":" + idJson + ",\"ok\":true,\"value\":{\"launched\":true}}"
                    : "{\"id\":" + idJson + ",\"ok\":false,\"code\":\"app-not-running\",\"error\":\"Coffre-Fort n'est pas ouvert.\"}";
                WriteFrame(output, Encoding.UTF8.GetBytes(reply));
            }
        }
        catch (Exception)
        {
            return;
        }
    }

    private static bool LaunchApp()
    {
        try
        {
            string app = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", AppExecutable));
            if (!File.Exists(app)) return false;
            Process.Start(new ProcessStartInfo(app) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(app) });
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    private static byte[] ReadFrame(Stream stream)
    {
        byte[] header = ReadExactly(stream, 4);
        if (header == null) return null;
        int length = BitConverter.ToInt32(header, 0);
        if (length < 0 || length > MaxFrameLength) return null;
        return ReadExactly(stream, length);
    }

    private static byte[] ReadExactly(Stream stream, int count)
    {
        byte[] buffer = new byte[count];
        int offset = 0;
        while (offset < count)
        {
            int read = stream.Read(buffer, offset, count - offset);
            if (read <= 0) return null;
            offset += read;
        }
        return buffer;
    }

    private static void WriteFrame(Stream stream, byte[] body)
    {
        byte[] frame = new byte[4 + body.Length];
        BitConverter.GetBytes(body.Length).CopyTo(frame, 0);
        body.CopyTo(frame, 4);
        lock (stream)
        {
            stream.Write(frame, 0, frame.Length);
            stream.Flush();
        }
    }

    private static string JsonString(string value)
    {
        StringBuilder builder = new StringBuilder("\"");
        foreach (char c in value)
        {
            if (c == '"' || c == '\\') builder.Append('\\').Append(c);
            else if (c < 0x20 || c > 0x7e) builder.AppendFormat("\\u{0:x4}", (int)c);
            else builder.Append(c);
        }
        return builder.Append('"').ToString();
    }
}
