% ThingSpeak MATLAB Analysis / Visualization example
% Channel fields: field 1 = heart rate (bpm), field 2 = SpO2 (%), field 3 = quality.
% Replace CHANNEL_ID and READ_API_KEY. Leave READ_API_KEY empty for a public channel.
CHANNEL_ID = 000000; % Replace with your numeric channel ID
READ_API_KEY = '';   % Private read key if the channel is private

if strlength(READ_API_KEY) > 0
    [data, timestamps] = thingSpeakRead(CHANNEL_ID, 'Fields', [1 2], ...
        'NumPoints', 100, 'ReadKey', READ_API_KEY, 'OutputFormat', 'table');
else
    [data, timestamps] = thingSpeakRead(CHANNEL_ID, 'Fields', [1 2], ...
        'NumPoints', 100, 'OutputFormat', 'table');
end

figure;
yyaxis left
plot(timestamps, data.Field1, '-o');
ylabel('Heart rate (bpm)');
yyaxis right
plot(timestamps, data.Field2, '-.');
ylabel('SpO2 (%)');
xlabel('Time');
title('ESP32 MAX30102 readings (research prototype)');
grid on;
